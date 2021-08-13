const deployer = require('../deployer')

const {
    constants: { _1e8, _1e18, ZERO },
    impersonateAccount
} = require('../utils');

const badgerMultiSig = '0xB65cef03b9B89f99517643226d76e286ee999e77'
const ibbtcMetaSig = '0xCF7346A5E41b0821b80D5B3fdc385EEB6Dc59F44'

describe.only('rebalance', function() {
    before('setup contracts', async function() {
        signers = await ethers.getSigners()
        alice = signers[0].address

        await network.provider.request({
            method: "hardhat_reset",
            params: [{
                forking: {
                    jsonRpcUrl: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY}`,
                    blockNumber: 12887417
                }
            }]
        })
        console.log('here 1')
        const Rebalance = await ethers.getContractFactory('Rebalance')
        console.log('here 2')
        rebalance = await Rebalance.deploy()
        console.log('here 3')

        const config = require('../../deployments/mainnet.json')
        ;([ badgerPeak, wbtcPeak, bBTC, zap ] = await Promise.all([
            ethers.getContractAt('BadgerSettPeak', config.badgerPeak),
            ethers.getContractAt('BadgerSettPeak', config.byvWbtcPeak),
            ethers.getContractAt('bBTC', config.bBtc),
            ethers.getContractAt('Zap', config.zap)
        ]))

        await impersonateAccount(badgerMultiSig)
        for (let i = 0; i < 3; i++) {
            const pool = await badgerPeak.pools(i)
            const sett = await ethers.getContractAt('ISett', pool.sett)
            await sett.connect(ethers.provider.getSigner(badgerMultiSig)).approveContractAccess(rebalance.address)
        }

        await impersonateAccount(ibbtcMetaSig)
        await web3.eth.sendTransaction({ from: alice, to: ibbtcMetaSig, value: _1e18 })
        await zap.connect(ethers.provider.getSigner(ibbtcMetaSig)).approveContractAccess(rebalance.address)
        await badgerPeak.connect(ethers.provider.getSigner(ibbtcMetaSig)).approveContractAccess(rebalance.address)
        await wbtcPeak.connect(ethers.provider.getSigner(ibbtcMetaSig)).approveContractAccess(rebalance.address)
    })

    it('execute', async function() {
        const crvRenWBTC = await ethers.getContractAt('IERC20', deployer.crvPools.ren.lpToken)
        const crvRenWSBTC = await ethers.getContractAt('IERC20', deployer.crvPools.sbtc.lpToken)

        console.log({
            crvRenWBTC: (await crvRenWBTC.balanceOf(badgerMultiSig)).toString(),
            crvRenWSBTC: (await crvRenWSBTC.balanceOf(badgerMultiSig)).toString(),
        })
        await crvRenWBTC.connect(ethers.provider.getSigner(badgerMultiSig)).approve(rebalance.address, await crvRenWBTC.balanceOf(badgerMultiSig))
        await crvRenWSBTC.connect(ethers.provider.getSigner(badgerMultiSig)).approve(rebalance.address, await crvRenWSBTC.balanceOf(badgerMultiSig))

        await rebalance.execute()
    })
})
