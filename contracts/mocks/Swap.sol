pragma solidity 0.6.11;

import {ISwap} from "../interfaces/ISwap.sol";

contract Swap is ISwap {
    function get_virtual_price() override external view returns (uint) {
        return 1e18;
    }
}



