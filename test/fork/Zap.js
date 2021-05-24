const _ = require('lodash');
const { expect } = require("chai");
const { BigNumber } = ethers

const deployer = require('../deployer')
const {
    constants: { _1e8, NULL },
    impersonateAccount
} = require('../utils');

let mintAndRedeemFee = BigNumber.from(10)
const PRECISION = BigNumber.from(10000)
const ZERO = BigNumber.from(0)
const _1e18 = ethers.constants.WeiPerEther

const byvWBTCHolder = '0xe9b05bc1fa8684ee3e01460aac2e64c678b9da5d'
const badgerMultiSig = '0xB65cef03b9B89f99517643226d76e286ee999e77'
const ibbtcMetaSig = '0xCF7346A5E41b0821b80D5B3fdc385EEB6Dc59F44'

const _1e17 = BigNumber.from(10).pow(17)

describe('Zap (mainnet-fork)', function() {
    before('setup contracts', async function() {
        signers = await ethers.getSigners()
        alice = signers[0].address

        await network.provider.request({
            method: "hardhat_reset",
            params: [{
                forking: {
                    jsonRpcUrl: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY}`,
                    blockNumber: 12495510
                }
            }]
        })

        const config = require('../../deployments/mainnet.json')
        ;([ badgerPeak, wbtcPeak, bBTC, core, Zap ] = await Promise.all([
            ethers.getContractAt('BadgerSettPeak', config.badgerPeak),
            ethers.getContractAt('BadgerYearnWbtcPeak', config.byvWbtcPeak),
            ethers.getContractAt('bBTC', config.bBtc),
            ethers.getContractAt('Core', config.core),
            ethers.getContractFactory('Zap')
        ]))
        zap = await Zap.deploy(badgerPeak.address, bBTC.address)
    })

    it.only('admin whitelists', async function() {
        await impersonateAccount(badgerMultiSig)
        for (let i = 0; i < 3; i++) {
            const pool = await badgerPeak.pools(i)
            const sett = await ethers.getContractAt('ISett', pool.sett)
            await sett.connect(ethers.provider.getSigner(badgerMultiSig)).approveContractAccess(zap.address)
        }

        await impersonateAccount(ibbtcMetaSig)
        await web3.eth.sendTransaction({ from: alice, to: ibbtcMetaSig, value: _1e18 })
        await badgerPeak.connect(ethers.provider.getSigner(ibbtcMetaSig)).approveContractAccess(zap.address)
        await core.connect(ethers.provider.getSigner(ibbtcMetaSig)).setGuestList(NULL)
    })

    it('mint with renbtc', async function() {
        const amount = _1e8.mul(9)
        const ren = await deployer.getRenbtc(alice, amount)
        await ren.approve(zap.address, amount)

        console.log(await zap.calcMintWithRen(amount.div(3)))
        await zap.mint(ren.address, amount.div(3), 0 /* crvRenWBTC */, 0 /* renbtc idx */)
        await zap.mint(ren.address, amount.div(3), 1 /* crvRenWSBTC */, 0 /* renbtc idx */)
        await zap.mint(ren.address, amount.div(3), 2 /* tbtc/sbtcCrv */, 1 /* renbtc idx */)

        const ibbtc = parseFloat((await bBTC.balanceOf(alice)).toString()) / 1e18
        expect(ibbtc > 8.9).to.be.true
    })

    it.only('mint with renbtc', async function() {
        const amount = _1e8.mul(9)
        const ren = await deployer.getRenbtc(alice, amount)
        await ren.approve(zap.address, amount)

        const calcMint = await zap.calcMintWithRen(amount.div(3))
        console.log(calcMint, calcMint.bBTC.toString())

        let prev = await bBTC.balanceOf(alice)
        await zap.mint(ren.address, amount.div(3), 0 /* crvRenWBTC */, 0 /* renbtc idx */)
        let now = await bBTC.balanceOf(alice)
        console.log({ minted: now.sub(prev).toString()})

        prev = now
        await zap.mint(ren.address, amount.div(3), 1 /* crvRenWSBTC */, 0 /* renbtc idx */)
        now = await bBTC.balanceOf(alice)
        console.log({ minted: now.sub(prev).toString()})

        prev = now
        await zap.mint(ren.address, amount.div(3), 2 /* tbtc/sbtcCrv */, 1 /* renbtc idx */)
        now = await bBTC.balanceOf(alice)
        console.log({ minted: now.sub(prev).toString()})

        const ibbtc = parseFloat((await bBTC.balanceOf(alice)).toString()) / 1e18
        expect(ibbtc > 8.9).to.be.true
    })

    it.only('mint with wbtc', async function() {
        const amount = _1e8.mul(9)
        const wbtc = await deployer.getWbtc(alice, amount)
        await wbtc.approve(zap.address, amount)

        const calcMint = await zap.calcMintWithWbtc(amount.div(3))
        console.log(calcMint, calcMint.bBTC.toString())

        let prev = await bBTC.balanceOf(alice)
        await zap.mint(wbtc.address, amount.div(3), 0 /* crvRenWBTC */, 1 /* wbtc idx */)
        let now = await bBTC.balanceOf(alice)
        console.log({ minted: now.sub(prev).toString()})

        prev = now
        await zap.mint(wbtc.address, amount.div(3), 1 /* crvRenWSBTC */, 1 /* wbtc idx */)
        now = await bBTC.balanceOf(alice)
        console.log({ minted: now.sub(prev).toString()})

        prev = now
        await zap.mint(wbtc.address, amount.div(3), 2 /* tbtc/sbtcCrv */, 2 /* wbtc idx */)
        now = await bBTC.balanceOf(alice)
        console.log({ minted: now.sub(prev).toString()})

        const ibbtc = parseFloat((await bBTC.balanceOf(alice)).toString()) / 1e18
        expect(ibbtc > 8.9).to.be.true
    })

    it('mint with wbtc', async function() {
        await bBTC.transfer(signers[1].address, await bBTC.balanceOf(alice)) // flush out balance

        const amount = _1e8.mul(9)
        const wbtc = await deployer.getWbtc(alice, amount)
        await wbtc.approve(zap.address, amount)

        await zap.mint(wbtc.address, amount.div(3), 0 /* crvRenWBTC */, 1 /* wbtc idx */)
        await zap.mint(wbtc.address, amount.div(3), 1 /* crvRenWSBTC */, 1 /* wbtc idx */)
        await zap.mint(wbtc.address, amount.div(3), 2 /* tbtc/sbtcCrv */, 2 /* wbtc idx */)

        const ibbtc = parseFloat((await bBTC.balanceOf(alice)).toString()) / 1e18
        expect(ibbtc > 8.9).to.be.true
    })
})
