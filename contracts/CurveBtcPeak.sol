pragma solidity 0.6.12;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20, SafeMath} from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/math/Math.sol";

import {ISwap} from "./interfaces/ISwap.sol";
import {ICore} from "./interfaces/ICore.sol";
import {ISett} from "./interfaces/ISett.sol";
import {IPeak} from "./interfaces/IPeak.sol";

import {Initializable} from "./common/Initializable.sol";
import {GovernableProxy} from "./common/GovernableProxy.sol";

import "hardhat/console.sol";

contract CurveBtcPeak is GovernableProxy, Initializable, IPeak {
    using SafeERC20 for IERC20;
    using SafeERC20 for ISett;
    using SafeMath for uint;
    using Math for uint;

    string constant ERR_INSUFFICIENT_FUNDS = "INSUFFICIENT_FUNDS";
    uint constant PRECISION = 1e4;

    struct CurvePool {
        IERC20 lpToken;
        ISwap swap;
        ISett sett;
    }
    mapping(uint => CurvePool) pools;

    ICore core;
    IERC20 bBtc;

    uint min;
    uint redeemFeeFactor;
    uint mintFeeFactor;
    uint numPools;

    // END OF STORAGE VARIABLES

    event Mint(address account, uint amount);
    event Redeem(address account, uint amount);
    event PoolWhitelisted(address lpToken, address swap, address sett);

    function initialize(ICore _core, IERC20 _bBtc)
        public
        notInitialized
    {
        core = _core;
        bBtc = _bBtc;
        _setParams(
            1000, // 1000 / PRECISION implies to keep 10% of curve LP token in the contract
            9990, // 9990 / PRECISION implies a mint fee of 0.1%
            9990 // 9990 / PRECISION implies a redeem fee of 0.1%
        );
    }

    function mintWithCurveLP(uint poolId, uint inAmount) external returns(uint) {
        CurvePool memory pool = pools[poolId];
        require(
            address(pool.lpToken) != address(0),
            "Curve LP Token not supported"
        );
        pool.lpToken.safeTransferFrom(msg.sender, address(this), inAmount);
        // best effort at keeping min.div(PRECISION) funds here
        uint farm = toFarm(pool);
        if (farm > 0) {
            pool.lpToken.safeApprove(address(pool.sett), farm);
            pool.sett.deposit(farm);
        }
        return _mint(inAmount.mul(pool.swap.get_virtual_price()).div(1e18));
    }

    function mintWithSettLP(uint poolId, uint inAmount) external returns(uint) {
        CurvePool memory pool = pools[poolId];
        // will revert if user passed an unsupported poolId
        pool.sett.safeTransferFrom(msg.sender, address(this), inAmount);
        return _mint(inAmount.mul(settToBtc(pool.swap, pool.sett)).div(1e18));
    }

    function _mint(uint btc) internal returns(uint) {
        uint _bBtc = core.mint(btc).mul(mintFeeFactor).div(PRECISION);
        bBtc.safeTransfer(msg.sender, _bBtc);
        emit Mint(msg.sender, _bBtc);
        return _bBtc;
    }

    function redeemInSettLP(uint _bBtc, uint poolId, uint minOut) external returns (uint) {
        bBtc.safeTransferFrom(msg.sender, address(this), _bBtc);
        uint btc = core.redeem(_bBtc.mul(redeemFeeFactor).div(PRECISION));
        CurvePool memory pool = pools[poolId];
        uint settLP = btc.mul(1e18).div(settToBtc(pool.swap, pool.sett));
        uint here = pool.sett.balanceOf(address(this));
        if (here < settLP) {
            // if there is not enough settLP, we make a best effort to deposit crvLP to settLP
            // how much are we short?
            uint farm = settLP.sub(here)
                .mul(pool.sett.getPricePerFullShare())
                .div(1e18)
                .min(pool.lpToken.balanceOf(address(this)));
            pool.lpToken.safeApprove(address(pool.sett), farm);
            pool.sett.deposit(farm);
            settLP = settLP.min(pool.sett.balanceOf(address(this)));
        }
        require(settLP >= minOut, ERR_INSUFFICIENT_FUNDS);
        pool.sett.safeTransfer(msg.sender, settLP);
        emit Redeem(msg.sender, settLP);
        return settLP;
    }

    function redeemInCurveLP(uint _bBtc, uint poolId, uint minOut) external returns (uint) {
        bBtc.safeTransferFrom(msg.sender, address(this), _bBtc);
        uint btc = core.redeem(_bBtc.mul(redeemFeeFactor).div(PRECISION));
        CurvePool memory pool = pools[poolId];
        uint curveLP = btc.mul(1e18).div(crvLPToBtc(pool.swap));
        uint here = pool.lpToken.balanceOf(address(this));
        if (here < curveLP) {
            // withdraw only as much as needed from the vault
            uint _withdraw = curveLP.sub(here).mul(1e18).div(pool.sett.getPricePerFullShare())
                .min(pool.sett.balanceOf(address(this)));
            pool.sett.withdraw(_withdraw);
            curveLP = pool.lpToken.balanceOf(address(this));
        }
        require(curveLP >= minOut, ERR_INSUFFICIENT_FUNDS);
        pool.lpToken.safeTransfer(msg.sender, curveLP);
    }

    /* ##### View ##### */

    // Sets minimum required on-hand to keep small withdrawals cheap
    function toFarm(CurvePool memory pool) internal view returns (uint) {
        uint here = pool.lpToken.balanceOf(address(this));
        uint total = pool.sett.balanceOf(address(this))
            .mul(pool.sett.getPricePerFullShare())
            .div(1e18)
            .add(here);
        uint shouldBeHere = total.mul(min).div(PRECISION);
        if (here > shouldBeHere) {
            return here.sub(shouldBeHere);
        }
        return 0;
    }

    function crvLPToBtc(ISwap swap) public view returns (uint) {
        return swap.get_virtual_price();
    }

    function settToBtc(ISwap swap, ISett sett) public view returns (uint) {
        return sett.getPricePerFullShare().mul(crvLPToBtc(swap)).div(1e18);
    }

    function portfolioValue() override external view returns (uint) {
        CurvePool memory pool;
        uint assets;
        for (uint i = 0; i < numPools; i++) {
            pool = pools[i];
            assets = pool.sett.balanceOf(address(this))
                .mul(pool.sett.getPricePerFullShare())
                .add(pool.lpToken.balanceOf(address(this)))
                .mul(crvLPToBtc(pool.swap))
                .div(1e36)
                .add(assets);
        }
        return assets;
    }

    /* ##### Admin ##### */

    function whitelistCurvePool(address lpToken, address swap, address sett)
        external
        onlyOwner
    {
        pools[numPools++] = CurvePool(IERC20(lpToken), ISwap(swap), ISett(sett));
        emit PoolWhitelisted(lpToken, swap, sett);
    }

    function setParams(uint _min, uint _mintFeeFactor, uint _redeemFeeFactor)
        external
        onlyOwner
    {
        _setParams(_min, _mintFeeFactor, _redeemFeeFactor);
    }

    function _setParams(uint _min, uint _mintFeeFactor, uint _redeemFeeFactor)
        internal
    {
        require(
            _min <= PRECISION
            && _mintFeeFactor <= PRECISION
            && _redeemFeeFactor <= PRECISION,
            "INVALID"
        );
        min = _min;
        mintFeeFactor = _mintFeeFactor;
        redeemFeeFactor = _redeemFeeFactor;
    }
}
