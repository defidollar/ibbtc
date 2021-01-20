pragma solidity 0.6.12;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {ICore} from "./interfaces/ICore.sol";

contract bBTC is ERC20 {
    address public immutable core;

    constructor(address _core)
        public
        ERC20("Badger BTC", "bBTC")
    {
        core = _core;
    }

    modifier onlyCore() {
        require(msg.sender == core, "bBTC: NO_AUTH");
        _;
    }

    function mint(address account, uint amount) public onlyCore {
        _mint(account, amount);
    }

    function burn(address account, uint amount) public onlyCore {
        _burn(account, amount);
    }

    function getPricePerFullShare() public view returns (uint) {
        return ICore(core).getPricePerFullShare();
    }
}
