pragma solidity 0.6.12;

interface IbBTC {
    function mint(address account, uint amount) external;
    function burn(address account, uint amount) external;
    function totalSupply() external view returns (uint);
}
