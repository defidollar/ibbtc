pragma solidity 0.6.12;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20, SafeMath} from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/math/Math.sol";

import {IPeak} from "./interfaces/IPeak.sol";
import {IbBTC} from "./interfaces/IbBTC.sol";
import {ICore} from "./interfaces/ICore.sol";

import {Initializable} from "./common/proxy/Initializable.sol";
import {GovernableProxy} from "./common/proxy/GovernableProxy.sol";

import "hardhat/console.sol";  // @todo remove

contract Core is GovernableProxy, Initializable, ICore {
    using SafeERC20 for IERC20;
    using SafeMath for uint;
    using Math for uint;

    enum PeakState { Extinct, Active, Dormant }
    struct Peak {
        PeakState state;
    }

    mapping(address => Peak) public peaks;
    address[] public peaksAddresses;

    IbBTC public immutable bBTC;

    // END OF STORAGE VARIABLES

    event PeakWhitelisted(address indexed peak);

    /**
    * @param _bBTC bBTC token address
    */
    constructor(IbBTC _bBTC) public {
        require(
            address(_bBTC) != address(0),
            "0 address during initialization"
        );
        bBTC = _bBTC;
    }

    /**
    * @notice Mint bBTC
    * @dev Only whitelisted peaks can call this function
    * @param btc BTC amount supplied, scaled by 1e18
    * @return bBtc Badger BTC that was minted
    */
    function mint(uint btc) override external returns(uint bBtc) {
        require(peaks[msg.sender].state == PeakState.Active, "PEAK_INACTIVE");
        // getPricePerFullShare can lose precision during division.
        // Dividing by a rounded-down value can round up the value, hence manually round it down.
        bBtc = btc.div(getPricePerFullShare()).sub(1);
        bBTC.mint(msg.sender, bBtc);
    }

    /**
    * @notice Redeem bBTC
    * @dev Only whitelisted peaks can call this function
    * @param bBtc bBTC amount to redeem
    * @return btc amount redeemed, scaled by 1e18
    */
    function redeem(uint bBtc) override external returns(uint btc) {
        require(peaks[msg.sender].state != PeakState.Extinct, "PEAK_EXTINCT");
        btc = bBtc.mul(getPricePerFullShare());
        bBTC.burn(msg.sender, bBtc);
    }

    /* ##### View ##### */

    function getPricePerFullShare() override public view returns (uint) {
        uint _totalSupply = bBTC.totalSupply();
        if (_totalSupply > 0) {
            return totalSystemAssets().mul(1e18).div(_totalSupply);
        }
        return 1e18;
    }

    function totalSystemAssets() public view returns (uint _totalAssets) {
        for (uint i = 0; i < peaksAddresses.length; i++) {
            Peak memory peak = peaks[peaksAddresses[i]];
            if (peak.state == PeakState.Extinct) {
                continue;
            }
            _totalAssets = _totalAssets.add(
                IPeak(peaksAddresses[i]).portfolioValue()
            );
        }
    }

    /* ##### Admin ##### */

    /**
    * @notice Whitelist a new peak
    * @param peak Address of the contract that interfaces with the 3rd-party protocol
    */
    function whitelistPeak(address peak)
        external
        onlyOwner
    {
        require(
            peaks[peak].state == PeakState.Extinct,
            "Peak already exists"
        );
        peaksAddresses.push(peak);
        peaks[peak] = Peak(PeakState.Active);
        emit PeakWhitelisted(peak);
    }

    /**
    * @notice Change a peaks status
    */
    function setPeakStatus(address peak, PeakState state)
        external
        onlyOwner
    {
        require(
            peaks[peak].state != PeakState.Extinct,
            "Peak is extinct"
        );
        peaks[peak].state = state;
    }
}
