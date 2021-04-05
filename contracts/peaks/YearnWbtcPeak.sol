pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20, SafeMath} from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/math/Math.sol";

import {AccessControlDefended} from "../common/AccessControlDefended.sol";
import {ICore} from "../interfaces/ICore.sol";
import {IyvWBTC} from "../interfaces/IyvWBTC.sol";
import {IPeak} from "../interfaces/IPeak.sol";

contract YearnWbtcPeak is AccessControlDefended, IPeak {
    using SafeERC20 for IERC20;
    using SafeERC20 for IyvWBTC;

    using SafeMath for uint;
    using Math for uint;

    ICore public immutable core;
    IyvWBTC public immutable yvWBTC;

    // END OF STORAGE VARIABLES

    event Mint(address account, uint ibBTC, uint yvWBTC);
    event Redeem(address account, uint ibBTC, uint yvWBTC);

    /**
    * @param _core Address of the the Core contract
    */
    constructor(address _core, address _yvWBTC) public {
        core = ICore(_core);
        yvWBTC = IyvWBTC(_yvWBTC);
    }

    /**
    * @notice Mint bBTC with yvWBTC token
    * @dev Invoking yvWBTC.safeTransferFrom() before core.mint(), will mess up core.totalSystemAssets() calculation
    * @param inAmount Amount of yvWBTC token to mint bBTC with
    * @return outAmount Amount of bBTC minted to user's account
    */
    function mint(uint inAmount)
        external
        defend
        blockLocked
        returns(uint outAmount)
    {
        _lockForBlock(msg.sender);
        outAmount = core.mint(_yTokenToBtc(inAmount), msg.sender);
        yvWBTC.safeTransferFrom(msg.sender, address(this), inAmount);
        emit Mint(msg.sender, outAmount, inAmount);
    }

    /**
    * @notice Redeem bBTC in yvWBTC tokens
    * @dev There might not be enough yvWBTC to fulfill the request, in which case the transaction will revert
    *      Invoking yvWBTC.safeTransfer() before core.redeem(), will mess up core.totalSystemAssets() calculation
    * @param inAmount Amount of bBTC to redeem
    * @return outAmount Amount of yvWBTC token
    */
    function redeem(uint inAmount)
        external
        defend
        blockLocked
        returns (uint outAmount)
    {
        _lockForBlock(msg.sender);
        outAmount = _btcToYVwbtc(core.redeem(inAmount, msg.sender));
        yvWBTC.safeTransfer(msg.sender, outAmount);
        emit Redeem(msg.sender, inAmount, outAmount);
    }

    /* ##### View ##### */

    function calcMint(uint inAmount)
        external
        view
        returns(uint bBTC, uint fee)
    {
        (bBTC, fee) = core.btcToBbtc(_yTokenToBtc(inAmount));
    }

    /**
    * @notice Determines the Sett tokens that will be received when redeeming bBTC
    * @return sett Number of sett tokens
    * @return fee Fee charges
    * @return max Max amount of bBTC redeemable for yvWBTC
    */
    function calcRedeem(uint bBtc)
        external
        view
        returns(uint sett, uint fee, uint max)
    {
        uint btc;
        (btc, fee) = core.bBtcToBtc(bBtc);
        sett = _btcToYVwbtc(btc);
        max = portfolioValue()
            .mul(1e18)
            .div(core.getPricePerFullShare());
    }

    function portfolioValue()
        override
        public
        view
        returns (uint)
    {
        return _yTokenToBtc(
            yvWBTC.balanceOf(address(this))
        );
    }

    /**
    * @dev Determine sett amount given btc
    * @param btc BTC amount, scaled by 1e36
    */
    function _btcToYVwbtc(uint btc)
        internal
        view
        returns(uint)
    {
        return btc // this value is scaled by 1e36
            .div(1e20)
            .div(yvWBTC.pricePerShare());
    }

    /**
    * @dev Determine btc amount given yvWBTC amount
    * @param amount yvWBTC amount
    * @return btc value, scaled by 1e18
    */
    function _yTokenToBtc(uint amount)
        internal
        view
        returns(uint)
    {
        // wBTC and yvWBTC are scaled by 8 decimals.
        // Multiply by 100 to return a value scaled by 1e18.
        return amount
            .mul(yvWBTC.pricePerShare())
            .mul(100);
    }
}
