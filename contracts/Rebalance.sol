// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20, SafeMath} from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import {ISett} from "./interfaces/ISett.sol";
import {IBadgerSettPeak, IByvWbtcPeak} from "./interfaces/IPeak.sol";

import {ICurveFi, Zap} from "./Zap.sol";

contract Rebalance {
    using SafeERC20 for IERC20;
    using SafeMath for uint;

    IBadgerSettPeak public constant settPeak = IBadgerSettPeak(0x41671BA1abcbA387b9b2B752c205e22e916BE6e3);
    IByvWbtcPeak public constant byvWbtcPeak = IByvWbtcPeak(0x825218beD8BE0B30be39475755AceE0250C50627);
    IERC20 public constant ibbtc = IERC20(0xc4E15973E6fF2A35cC804c2CF9D2a1b817a8b40F);
    IERC20 public constant wbtc = IERC20(0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599);

    IZap public constant zap = IZap(0x4459A591c61CABd905EAb8486Bf628432b15C8b1);

    address multiSig = 0xB65cef03b9B89f99517643226d76e286ee999e77;

    function execute() external {
        // Desired: bcrvRenWBTC = 400, bcrvRenWSBTC = 200, btbtc/sbtcCrv = 0, byvWBTC = 67
        // Current: bcrvRenWBTC = 31.7, bcrvRenWSBTC = 0.7, btbtc/sbtcCrv = 9.95, byvWBTC = 624

        _mint(0, 100e18); // mint ibbtc with 100 crvRenWBTC
        _mint(1, 50e18);  // mint ibbtc with 50 crvRenWSBTC

        // composition: bcrvRenWBTC = 131.7, bcrvRenWSBTC = 50.7, btbtc/sbtcCrv = 9.95, byvWBTC = 624
        // redeem ibbtc in wbtc
        uint _ibbtc = ibbtc.balanceOf(address(this));
        uint redeemFromTbtc = 9e18;
        zap.redeem(wbtc, 9e18, 2, 2 /* wbtc */, 0); // redeem from tbtc-sbtcCrv
        zap.redeem(wbtc, _ibbtc.sub(redeemFromTbtc) /* ~40 */, 3, 0, 0); // redeem from byvwbtc

        // bcrvRenWBTC = 131.7, bcrvRenWSBTC = 50.7, btbtc/sbtcCrv = ~0, byvWBTC = 484
        // contract has ~150 wbtc
        uint _wbtc = wbtc.balanceOf(address(this));
        _ibbtc = zap.mint(wbtc, _wbtc, 0, 1, 0); // mint with bcrvRenWBTC

        // bcrvRenWBTC = 281.7, bcrvRenWSBTC = 50.7, btbtc/sbtcCrv = ~0, byvWBTC = 484
        zap.redeem(wbtc, _ibbtc, 3, 0, 0); // redeem from byvwbtc

        // bcrvRenWBTC = 281.7, bcrvRenWSBTC = 50.7, btbtc/sbtcCrv = ~0, byvWBTC = 334
        _wbtc = 120e8;
        _ibbtc = zap.mint(wbtc, _wbtc, 0, 1, 0); // mint with bcrvRenWBTC

        // bcrvRenWBTC = 400, bcrvRenWSBTC = 50.7, btbtc/sbtcCrv = ~0, byvWBTC = 334
        zap.redeem(wbtc, _ibbtc, 3, 0, 0); // redeem from byvwbtc

        // bcrvRenWBTC = 400, bcrvRenWSBTC = 50.7, btbtc/sbtcCrv = ~0, byvWBTC = 214
        _wbtc = wbtc.balanceOf(address(this)); // ~150
        zap.mint(wbtc, _wbtc, 1, 1, 0); // mint with bcrvRenWSBTC

        // bcrvRenWBTC = 400, bcrvRenWSBTC = 200, btbtc/sbtcCrv = ~0, byvWBTC = 214
        _ibbtc = ibbtc.balanceOf(address(this)); // ~150
        zap.redeem(wbtc, _ibbtc, 3, 0, 0); // redeem from byvwbtc
        // bcrvRenWBTC = 400, bcrvRenWSBTC = 200, btbtc/sbtcCrv = ~0, byvWBTC = 64

        // transfer wbtc to msig
    }

    function _mint(uint poolId, uint amount) internal {
        Zap.Pool memory pool = zap.pools(poolId);
        pool.lpToken.safeTransferFrom(multiSig, address(this), amount);
        pool.sett.deposit(amount);

        amount = pool.sett.balanceOf(address(this));
        IERC20(address(pool.sett)).safeApprove(address(settPeak), amount);
        settPeak.mint(poolId, amount, new bytes32[](0));
    }
}

interface IZap {
    function pools(uint idx) external returns(Zap.Pool memory);

    function mint(IERC20 token, uint amount, uint poolId, uint idx, uint minOut)
        external
        returns(uint _ibbtc);

    function redeem(IERC20 token, uint amount, uint poolId, int128 idx, uint minOut)
        external
        returns(uint out);
}
