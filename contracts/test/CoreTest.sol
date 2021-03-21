pragma solidity 0.6.11;

import {Core} from "../Core.sol";

contract CoreTest is Core {
    constructor(address _bBTC) public Core(_bBTC) {}

    function setConfig(uint _mintFee, uint _redeemFee, address _feeSink)
        override
        external
        onlyGovernance
    {
        require(
            _mintFee <= PRECISION
            && _redeemFee <= PRECISION,
            "INVALID_PARAMETERS"
        );
        require(_feeSink != address(0), "NULL_ADDRESS");
        mintFee = _mintFee;
        redeemFee = _redeemFee;
        feeSink = _feeSink;
    }
}
