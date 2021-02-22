const fs = require('fs')

async function main() {
    const [ UpgradableProxy, BadgerSettPeak, Core, bBTC, CurveLPToken, Swap, Sett ] = await Promise.all([
        ethers.getContractFactory("UpgradableProxy"),
        ethers.getContractFactory("BadgerSettPeak"),
        ethers.getContractFactory("Core"),
        ethers.getContractFactory("bBTC"),
        ethers.getContractFactory("CurveLPToken"),
        ethers.getContractFactory("Swap"),
        ethers.getContractFactory("Sett")
    ])
    let core = await UpgradableProxy.deploy()
    const [ bBtc, curveLPToken, swap ] = await Promise.all([
        bBTC.deploy(core.address),
        CurveLPToken.deploy(),
        Swap.deploy(),
    ])
    await core.updateImplementation((await Core.deploy(bBtc.address)).address)
    core = await ethers.getContractAt('Core', core.address)

    let curveBtcPeak = await UpgradableProxy.deploy()
    await curveBtcPeak.updateImplementation((await BadgerSettPeak.deploy(core.address, bBtc.address)).address)
    curveBtcPeak = await ethers.getContractAt('BadgerSettPeak', curveBtcPeak.address)

    const sett = await Sett.deploy(curveLPToken.address)
    const signers = await ethers.getSigners()
    const feeSink = signers[9].address
    await Promise.all([
        core.whitelistPeak(curveBtcPeak.address),
        curveBtcPeak.modifyConfig(9990, 9990, feeSink),
        curveBtcPeak.modifyWhitelistedCurvePools([{ lpToken: curveLPToken.address, swap: swap.address, sett: sett.address }])
    ])
    const config = {
        BadgerPeak: curveBtcPeak.address,
        bcrvRenWSBTC: sett.address,
        bBtc: bBtc.address
    }
    fs.writeFileSync(
        `${process.cwd()}/deployments/local.json`,
        JSON.stringify(config, null, 4) // Indent 4 spaces
    )
}

main()
.then(() => process.exit(0))
.catch(error => {
    console.error(error);
    process.exit(1);
});
