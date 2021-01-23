pragma solidity 0.6.11;

interface ISwap {
    function get_virtual_price() external view returns (uint);
}
