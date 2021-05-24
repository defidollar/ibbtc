// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20, SafeMath} from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import {ISett} from "./interfaces/ISett.sol";
import {IBadgerSettPeak} from "./interfaces/IPeak.sol";
import {IbBTC} from "./interfaces/IbBTC.sol";

contract Zap {
    using SafeERC20 for IERC20;
    using SafeMath for uint;

    struct Pool {
        IERC20 lpToken;
        ICurveFi deposit;
        ISett sett;
    }
    Pool[3] public pools;
    IBadgerSettPeak public immutable peak;
    IbBTC public immutable ibbtc;

    constructor(IBadgerSettPeak _peak, IbBTC _ibbtc) public {
        pools[0] = Pool({ // crvRenWBTC [ ren, wbtc ]
            lpToken: IERC20(0x49849C98ae39Fff122806C06791Fa73784FB3675),
            deposit: ICurveFi(0x93054188d876f558f4a66B2EF1d97d16eDf0895B),
            sett: ISett(0x6dEf55d2e18486B9dDfaA075bc4e4EE0B28c1545)
        });
        pools[1] = Pool({ // crvRenWSBTC [ ren, wbtc, sbtc ]
            lpToken: IERC20(0x075b1bb99792c9E1041bA13afEf80C91a1e70fB3),
            deposit: ICurveFi(0x7fC77b5c7614E1533320Ea6DDc2Eb61fa00A9714),
            sett: ISett(0xd04c48A53c111300aD41190D63681ed3dAd998eC)
        });
        pools[2] = Pool({ // tbtc/sbtcCrv [ tbtc, ren, wbtc, sbtc ]
            lpToken: IERC20(0x64eda51d3Ad40D56b9dFc5554E06F94e1Dd786Fd),
            deposit: ICurveFi(0xaa82ca713D94bBA7A89CEAB55314F9EfFEdDc78c),
            sett: ISett(0xb9D076fDe463dbc9f915E5392F807315Bf940334)
        });

        for (uint i = 0; i < pools.length; i++) {
            Pool memory pool = pools[i];
            pool.lpToken.safeApprove(address(pool.sett), uint(-1));
            IERC20(address(pool.sett)).safeApprove(address(_peak), uint(-1));
        }
        peak = _peak;
        ibbtc = _ibbtc;
    }

    function mint(IERC20 token, uint amount, uint poolId, uint idx) external {
        token.safeTransferFrom(msg.sender, address(this), amount);
        Pool memory pool = pools[poolId];
        _addLiquidity(token, amount, pool.deposit, idx, poolId + 2); // pools are such that the #tokens they support is +2 from their poolId.
        pool.sett.deposit(pool.lpToken.balanceOf(address(this)));
        uint _ibbtc = peak.mint(poolId, pool.sett.balanceOf(address(this)), new bytes32[](0));
        IERC20(address(ibbtc)).safeTransfer(msg.sender, _ibbtc);
    }

    function _addLiquidity(
        IERC20 _token, // in token
        uint amount,
        ICurveFi _pool,
        uint256 _i, // coins idx
        uint256 _numTokens // num of coins
    ) internal {
        _token.safeApprove(address(_pool), amount);

        if (_numTokens == 2) {
            uint256[2] memory amounts;
            amounts[_i] = amount;
            _pool.add_liquidity(amounts, 0);
        }

        if (_numTokens == 3) {
            uint256[3] memory amounts;
            amounts[_i] = amount;
            _pool.add_liquidity(amounts, 0);
        }

        if (_numTokens == 4) {
            uint256[4] memory amounts;
            amounts[_i] = amount;
            _pool.add_liquidity(amounts, 0);
        }
    }

    function calcMintWithRen(uint amount) external view returns(uint poolId, uint idx, uint bBTC, uint fee) {
        uint _ibbtc;
        uint _fee;

        // poolId=0, idx=0
        (bBTC, fee) = lpToIbbtc(0, pools[0].deposit.calc_token_amount([amount,0], true));

        (_ibbtc, _fee) = lpToIbbtc(1, pools[1].deposit.calc_token_amount([amount,0,0], true));
        if (_ibbtc > bBTC) {
            bBTC = _ibbtc;
            fee = _fee;
            poolId = 1;
            // idx=0
        }

        (_ibbtc, _fee) = lpToIbbtc(2, pools[2].deposit.calc_token_amount([0,amount,0,0], true));
        if (_ibbtc > bBTC) {
            bBTC = _ibbtc;
            fee = _fee;
            poolId = 2;
            idx = 1;
        }
    }

    function calcMintWithWbtc(uint amount) external view returns(uint poolId, uint idx, uint bBTC, uint fee) {
        uint _ibbtc;
        uint _fee;

        // poolId=0
        (bBTC, fee) = lpToIbbtc(0, pools[0].deposit.calc_token_amount([0,amount], true));
        idx = 1;

        (_ibbtc, _fee) = lpToIbbtc(1, pools[1].deposit.calc_token_amount([0,amount,0], true));
        if (_ibbtc > bBTC) {
            bBTC = _ibbtc;
            fee = _fee;
            poolId = 1;
            // idx=1
        }

        (_ibbtc, _fee) = lpToIbbtc(2, pools[2].deposit.calc_token_amount([0,0,amount,0], true));
        if (_ibbtc > bBTC) {
            bBTC = _ibbtc;
            fee = _fee;
            poolId = 2;
            idx = 2;
        }
    }

    function lpToIbbtc(uint poolId, uint _lp) public view returns(uint bBTC, uint fee) {
        Pool memory pool = pools[poolId];
        uint _sett = _lp.mul(1e18).div(pool.sett.getPricePerFullShare());
        return peak.calcMint(poolId, _sett);
    }
}

interface ICurveFi {
    function add_liquidity(uint256[2] calldata amounts, uint256 min_mint_amount) external;
    function calc_token_amount(uint256[2] calldata amounts, bool isDeposit) external view returns(uint);

    function add_liquidity(uint256[3] calldata amounts, uint256 min_mint_amount) external;
    function calc_token_amount(uint256[3] calldata amounts, bool isDeposit) external view returns(uint);

    function add_liquidity(uint256[4] calldata amounts, uint256 min_mint_amount) external;
    function calc_token_amount(uint256[4] calldata amounts, bool isDeposit) external view returns(uint);
}
