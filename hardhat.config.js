require('@nomiclabs/hardhat-waffle')
require('@nomiclabs/hardhat-web3')
require("solidity-coverage")
require("@tenderly/hardhat-tenderly")

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
