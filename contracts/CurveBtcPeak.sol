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

import "hardhat/console.sol"; // @todo remove

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

    function mintWithCurveLP(uint poolId, uint inAmount) external returns(uint outAmount) {
        CurvePool memory pool = pools[poolId];
        // will revert if user passed an unsupported poolId
        outAmount = _mint(inAmount.mul(pool.swap.get_virtual_price()).div(1e18));
        pool.lpToken.safeTransferFrom(msg.sender, address(this), inAmount);
        _balanceFunds(pool);
    }

    function mintWithSettLP(uint poolId, uint inAmount) external returns(uint outAmount) {
        CurvePool memory pool = pools[poolId];
        outAmount = _mint(inAmount.mul(settToBtc(pool.swap, pool.sett)).div(1e18));
        // will revert if user passed an unsupported poolId
        pool.sett.safeTransferFrom(msg.sender, address(this), inAmount);
    }

    function _mint(uint btc) internal returns(uint outAmount) {
        outAmount = core.mint(btc).mul(mintFeeFactor).div(PRECISION);
        bBtc.safeTransfer(msg.sender, outAmount);
        emit Mint(msg.sender, outAmount);
    }

    function redeemInSettLP(uint poolId, uint _bBtc, uint minOut) external returns (uint outAmount) {
        bBtc.safeTransferFrom(msg.sender, address(this), _bBtc);
        uint btc = core.redeem(_bBtc.mul(redeemFeeFactor).div(PRECISION));
        CurvePool memory pool = pools[poolId];
        outAmount = btc.mul(1e18).div(settToBtc(pool.swap, pool.sett));
        uint here = pool.sett.balanceOf(address(this));
        if (here < outAmount) {
            // if there is not enough settLP, we make a best effort to deposit crvLP to sett
            // how much are we short?
            uint farm = outAmount.sub(here)
                .mul(pool.sett.getPricePerFullShare())
                .div(1e18)
                .min(pool.lpToken.balanceOf(address(this)));
            pool.lpToken.safeApprove(address(pool.sett), farm);
            pool.sett.deposit(farm);
            outAmount = outAmount.min(pool.sett.balanceOf(address(this)));
        }
        require(outAmount >= minOut, ERR_INSUFFICIENT_FUNDS);
        pool.sett.safeTransfer(msg.sender, outAmount);
        emit Redeem(msg.sender, outAmount);
    }

    function redeemInCurveLP(uint poolId, uint _bBtc, uint minOut) external returns (uint outAmount) {
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
        return curveLP;
    }

    /* ##### View ##### */

    // Sets minimum required on-hand to keep small withdrawals cheap
    function _balanceFunds(CurvePool memory pool) internal {
        uint here = pool.lpToken.balanceOf(address(this));
        uint total = pool.sett.balanceOf(address(this))
            .mul(pool.sett.getPricePerFullShare())
            .div(1e18)
            .add(here);
        uint shouldBeHere = total.mul(min).div(PRECISION);
        if (here <= shouldBeHere) {
            return;
        }
        // best effort at keeping min.div(PRECISION) funds here
        uint farm = here.sub(shouldBeHere);
        pool.lpToken.safeApprove(address(pool.sett), farm);
        pool.sett.deposit(farm);
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
                .div(1e18)
                .add(pool.lpToken.balanceOf(address(this)))
                .mul(crvLPToBtc(pool.swap))
                .div(1e18)
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
