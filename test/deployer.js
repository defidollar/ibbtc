async function setupContracts() {
    const [ CurveBtcPeak, Core, bBTC, CurveLPToken, Swap, Sett ] = await Promise.all([
        ethers.getContractFactory("CurveBtcPeak"),
        ethers.getContractFactory("Core"),
        ethers.getContractFactory("bBTC"),
        ethers.getContractFactory("CurveLPToken"),
        ethers.getContractFactory("Swap"),
        ethers.getContractFactory("Sett")
    ])
    const core = await Core.deploy()
    const [ bBtc, curveBtcPeak, curveLPToken, swap ] = await Promise.all([
        bBTC.deploy(core.address),
        CurveBtcPeak.deploy(),
        CurveLPToken.deploy(),
        Swap.deploy(),
    ])
    const sett = await Sett.deploy(curveLPToken.address)
    await Promise.all([
        core.initialize(bBtc.address),
        core.whitelistPeak(curveBtcPeak.address),
        curveBtcPeak.initialize(core.address, bBtc.address),
        curveBtcPeak.whitelistCurvePool(curveLPToken.address, swap.address, sett.address)
    ])
    return { curveBtcPeak, curveLPToken, bBtc, sett, swap, core }
}

const badgerDevMultisig = '0xB65cef03b9B89f99517643226d76e286ee999e77'

async function setupMainnetContracts() {
    await network.provider.request({
        method: "hardhat_reset",
        params: [{
            forking: {
                jsonRpcUrl: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY}`,
                blockNumber: 11685090 // having a consistent block number speeds up the tests across runs
            }
        }]
    })
    const [CurveBtcPeak, Core, bBTC] = await Promise.all([
        ethers.getContractFactory('CurveBtcPeak'),
        ethers.getContractFactory('Core'),
        ethers.getContractFactory('bBTC'),
    ])
    const core = await Core.deploy()
    let [bBtc, curveBtcPeak, curveLPToken, swap, sett] = await Promise.all([
        bBTC.deploy(core.address),
        CurveBtcPeak.deploy(),
        ethers.getContractAt('CurveLPToken', '0x075b1bb99792c9E1041bA13afEf80C91a1e70fB3'),
        ethers.getContractAt('Swap', '0x7fC77b5c7614E1533320Ea6DDc2Eb61fa00A9714'),
        ethers.getContractAt('Sett', '0xd04c48A53c111300aD41190D63681ed3dAd998eC')
    ])
    await Promise.all([
        core.initialize(bBtc.address),
        core.whitelistPeak(curveBtcPeak.address),
        curveBtcPeak.initialize(core.address, bBtc.address),
        curveBtcPeak.whitelistCurvePool(
            curveLPToken.address,
            swap.address,
            sett.address,
        ),
    ])
    await web3.eth.sendTransaction({ to: badgerDevMultisig, value: web3.utils.toWei('1'), from: (await ethers.getSigners())[0].address })
    await impersonateAccount(badgerDevMultisig)
    await sett.connect(ethers.provider.getSigner(badgerDevMultisig)).approveContractAccess(curveBtcPeak.address)
    return { curveBtcPeak, curveLPToken, bBtc, sett, swap, core }

}

const crvRenWSBTCHolder = '0x664dd5bcf28bbb3518ff532a384849830f2154ea'

async function getCrvRenWSBTC(curveLPToken, account, amount) {
    if (process.env.MODE === 'FORK') {
        await impersonateAccount(crvRenWSBTCHolder)
        return curveLPToken.connect(ethers.provider.getSigner(crvRenWSBTCHolder)).transfer(account, amount)
    }
    return curveLPToken.mint(alice, amount)
}

async function impersonateAccount(account) {
    await network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [account],
    })
}

module.exports = { setupContracts, setupMainnetContracts, getCrvRenWSBTC }
