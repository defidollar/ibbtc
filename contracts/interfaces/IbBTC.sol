pragma solidity 0.6.11;

interface IbBTC {
    function mint(address account, uint amount) external;
    function burn(address account, uint amount) external;
}
