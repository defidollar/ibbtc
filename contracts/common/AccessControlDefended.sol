// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import {GovernableProxy} from "./proxy/GovernableProxy.sol";
import {PausableSlot} from "../common/PausableSlot.sol";
contract AccessControlDefendedBase {
    mapping (address => bool) public approved;
    mapping(address => uint256) public blockLock;
    
    modifier defend() {
        require(msg.sender == tx.origin || approved[msg.sender], "ACCESS_DENIED");
        _;
    }

    modifier blockLocked() {
        require(approved[msg.sender] || blockLock[msg.sender] < block.number, "BLOCK_LOCKED");
        _;
    }
   
    function _lockForBlock(address account) internal {
        blockLock[account] = block.number;
    }

    function _approveContractAccess(address account) internal {
        approved[account] = true;
    }

    function _revokeContractAccess(address account) internal {
        approved[account] = false;
    }
}

contract AccessControlDefended is GovernableProxy, AccessControlDefendedBase, PausableSlot {
    address constant public badgerGovernance = 0xB65cef03b9B89f99517643226d76e286ee999e77;
    address public guardian;
    uint256[49] private __gap;

     modifier onlyGovernanceOrBadgerGovernance() {
        require(msg.sender == badgerGovernance || msg.sender == owner(), "onlyGovernanceOrBadgerGovernance");
        _;
    }

    modifier onlyGuardianOrGovernance() {
        require(msg.sender == guardian || msg.sender == owner(), "onlyGuardianOrGovernance");
        _;
    }

    function approveContractAccess(address account) external onlyGovernanceOrBadgerGovernance {
        _approveContractAccess(account);
    }

    function revokeContractAccess(address account) external onlyGovernanceOrBadgerGovernance {
        _revokeContractAccess(account);
    }

    function setGuardian(address _guardian) external onlyGovernanceOrBadgerGovernance {
        guardian = _guardian;
    }

    function pause() external onlyGuardianOrGovernance {
        _pause();
    }

    function unpause() external onlyGovernanceOrBadgerGovernance {
        _unpause();
    }
}
