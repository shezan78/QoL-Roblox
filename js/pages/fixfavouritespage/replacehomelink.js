IsFeatureEnabled("FixFavouritesPage").then(async function(Enabled){
    if (!Enabled) return

    // while (true){
    //     const SeeAllButtons = document.getElementsByClassName("btn-secondary-xs see-all-link-icon btn-more")

    //     for (let i = 0; i < SeeAllButtons.length; i++){
    //         const Button = SeeAllButtons[i]
    //         if (Button.href.search("sortName/v2/Favorites") > -1){
    //             Button.href = "https://www.roblox.com/discover#/sortName?sort=Favorites"
    //             return
    //         }
    //     }

    //     await sleep(20)
    // }

    //setTimeout(async function(){
        let GamesList = await WaitForClass("game-home-page-container")
        if (await IsFeatureEnabled("TemporaryHomePageContainerFix")) GamesList = (await WaitForClassPath(GamesList, "game-carousel")).parentNode
        const [Title] = await SearchForRow(GamesList, 100000001)
        const SeeAll = await WaitForClassPath(Title, "see-all-link-icon")
        SeeAll.href = "https://www.roblox.com/discover#/sortName?sort=Favorites"
    //}, 0)
})