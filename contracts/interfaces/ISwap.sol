pragma solidity 0.6.12;

interface ISwap {
    function get_virtual_price() external view returns (uint);
}
