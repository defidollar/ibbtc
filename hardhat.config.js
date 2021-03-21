require('@nomiclabs/hardhat-waffle')
require('@nomiclabs/hardhat-web3')
require("solidity-coverage")
require("@nomiclabs/hardhat-etherscan");

const PRIVATE_KEY = `0x${process.env.PRIVATE_KEY || '2c82e50c6a97068737361ecbb34b8c1bd8eb145130735d57752de896ee34c74b'}`

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
    networks: {
        local: {
            url: 'http://localhost:8545'
        },
        hardhat: {
            chainId: 1337,
        },
        mainnet: {
            url: `https://mainnet.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
            chainId: 1,
            gasPrice: 99000000000, // 99 gwei
            accounts: [ PRIVATE_KEY ]
        }
    },
    solidity: {
        version: '0.6.11',
    },
    etherscan: {
        apiKey: `${process.env.ETHERSCAN || ''}`
    },
    mocha: {
        timeout: 0
    }
}
