pragma solidity 0.6.11;

interface ICore {
    function mint(uint btc) external returns (uint);
    function redeem(uint btc) external returns (uint);
    function getPricePerFullShare() external view returns (uint);
}
