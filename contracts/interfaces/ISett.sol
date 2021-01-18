pragma solidity 0.6.12;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ISett is IERC20 {
    function deposit(uint256 _amount) external;
    function withdraw(uint256 _shares) external;
    function withdrawAll() external;
    function getPricePerFullShare() external view returns (uint256);
    function approveContractAccess(address account) external;
}
