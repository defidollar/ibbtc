pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20, SafeMath} from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/math/Math.sol";

import {ISaddleSwap} from "../interfaces/ISwap.sol";
import {ICore} from "../interfaces/ICore.sol";
import {ISett} from "../interfaces/ISett.sol";
import {IPeak} from "../interfaces/IPeak.sol";

import {AccessControlDefended} from "../common/AccessControlDefended.sol";

contract SaddlePeak is AccessControlDefended, IPeak {
    using SafeERC20 for IERC20;
    using SafeERC20 for ISett;
    using SafeMath for uint;
    using Math for uint;

    ICore public immutable core;

    struct CurvePool {
        IERC20 lpToken;
        ISaddleSwap swap;
    }
    mapping(uint => CurvePool) public pools;
    uint public numPools;

    // END OF STORAGE VARIABLES

    event Mint(address account, uint amount);
    event Redeem(address account, uint amount);

    /**
    * @param _core Address of the the Core contract
    */
    constructor(address _core) public {
        core = ICore(_core);
    }

    /**
    * @notice Mint bBTC with Sett LP token
    * @param poolId System internal ID of the whitelisted curve pool
    * @param inAmount Amount of Sett LP token to mint bBTC with
    * @return outAmount Amount of bBTC minted to user's account
    */
    function mint(uint poolId, uint inAmount)
        external
        override
        defend
        blockLocked
        returns(uint outAmount)
    {
        _lockForBlock(msg.sender);
        CurvePool memory pool = pools[poolId];
        outAmount = core.mint(_settToBtc(pool, inAmount), msg.sender);
        // will revert if user passed an unsupported poolId
        pool.lpToken.safeTransferFrom(msg.sender, address(this), inAmount);
        emit Mint(msg.sender, outAmount);
    }

    /**
    * @notice Redeem bBTC in Sett LP tokens
    * @dev There might not be enough Sett LP to fulfill the request, in which case the transaction will revert
    * @param poolId System internal ID of the whitelisted curve pool
    * @param inAmount Amount of bBTC to redeem
    * @return outAmount Amount of Sett LP token
    */
    function redeem(uint poolId, uint inAmount)
        external
        override
        defend
        blockLocked
        returns (uint outAmount)
    {
        _lockForBlock(msg.sender);
        CurvePool memory pool = pools[poolId];
        outAmount = _btcToSett(pool, core.redeem(inAmount, msg.sender));
        // will revert if the contract has insufficient funds.
        // This opens up a couple front-running vectors. @todo Discuss with Badger team about possibilities.
        pool.lpToken.safeTransfer(msg.sender, outAmount);
        emit Redeem(msg.sender, inAmount);
    }

    /* ##### View ##### */

    function calcMint(uint poolId, uint inAmount) override external view returns(uint bBtc) {
        (bBtc,) = core.btcToBbtc(_settToBtc(pools[poolId], inAmount));
    }

    function calcRedeem(uint poolId, uint _bBtc) override external view returns(uint) {
        (uint btc,) = core.bBtcToBtc(_bBtc);
        return _btcToSett(pools[poolId], btc);
    }

    function portfolioValue()
        override
        external
        view
        returns (uint assets)
    {
        CurvePool memory pool;
        // We do not expect to have more than 3-4 pools, so this loop should be fine
        for (uint i = 0; i < numPools; i++) {
            pool = pools[i];
            assets = assets
                .add(
                    _settToBtc(
                        pool,
                        pool.lpToken.balanceOf(address(this))
                    )
                    .div(1e18)
                );
        }
    }

    function _btcToSett(CurvePool memory pool, uint btc)
        internal
        view
        returns(uint)
    {
        return btc.div(_settToBtc(pool, 1e18).div(1e18));
    }

    function _settToBtc(CurvePool memory pool, uint amount)
        internal
        view
        returns(uint)
    {
        return amount
            .mul(pool.swap.getVirtualPrice()); // scaled by 1e18; allows us a gas optimization in core.mint
    }

    /* ##### Admin ##### */

    /**
    * @notice Manage whitelisted curve pools and their respective sett vaults
    */
    function modifyWhitelistedCurvePools(
        CurvePool[] calldata _pools
    )
        external
        onlyGovernance
    {
        numPools = _pools.length;
        CurvePool memory pool;
        for (uint i = 0; i < numPools; i++) {
            pool = _pools[i];
            require(
                address(pool.lpToken) != address(0)
                && address(pool.swap) != address(0),
                "NULL_ADDRESS"
            );
            pools[i] = CurvePool(pool.lpToken, pool.swap);
        }
    }
}
