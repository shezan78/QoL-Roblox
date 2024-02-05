let IsPurchasedGamesOpened = false
let CurrentPurchasedGamesPage = 1

let OpenPurchasedGamesConnections = []
let PurchasedGamesCards = []

function HideDefaultCard2(Element, Hide){
    if (!Element.getAttribute("custom") && Element.className == "list-item item-card ng-scope place-item"){
        Element.style = Hide && "display:none;" || ""
    }
}

function HideRobloxDefaultCards2(ServerListElement, Hide){
    const children = ServerListElement.children

    for (let i = 0; i < children.length; i++){
       HideDefaultCard(children[i], Hide)
    }
}

function ClearPurchasedGamesCards(){
    for (let i = 0; i < PurchasedGamesCards.length; i++){
        PurchasedGamesCards[i].remove()
    }
    PurchasedGamesCards = []
}

async function CreateCardsFromPurchasedGames(Servers, ServerListElement){
    //ClearAllChildren(ServerListElement)
    HideRobloxDefaultCards2(ServerListElement, true)
    ClearPurchasedGamesCards()

    for (let i = 0; i < Servers.length; i++){
        const Server = Servers[i]
        const Card = CreatePrivateServerCard(Server.Image, Server.Name, Server.OwnerName, Server.OwnerId, Server.OwnerType, Server.Price, Server.PlaceId)

        ServerListElement.appendChild(Card)
        PurchasedGamesCards.push(Card)
    }

    ServerListElement.parentElement.className = "current-items"
}

function AddConnection(Callback, Type, Element){
    OpenPurchasedGamesConnections.push({Callback: Callback, Type: Type, Element: Element})
    return Callback
}

async function PurchasedGamesOpened(){
    CurrentPurchasedGamesPage = 1

    WaitForClass("breadcrumb-container").then(Container => {
        const LabelContainer = Container.getElementsByTagName("li")[2]
        LabelContainer.getElementsByTagName("span")[0].innerText = "Purchased"
    })

    const ServerListElement = await WaitForClass("hlist item-cards item-cards-embed ng-scope")
    //ClearAllChildren(ServerListElement)
    ClearPurchasedGamesCards()
    HideRobloxDefaultCards2(ServerListElement, true)

    function SetButtonStatus(Button, Enabled){
        const NewAttribute = Enabled && "enabled" || "disabled"
        const OldAttribute = !Enabled && "enabled" || "disabled"
        Button.removeAttribute(OldAttribute)
        Button.setAttribute(NewAttribute, NewAttribute)
    }

    const NextPageButton = await WaitForClass("btn-generic-right-sm")
    const PreviousPageButton = await WaitForClass("btn-generic-left-sm")
    const PageLabel = (await WaitForClass("pager")).getElementsByTagName("li")[1].getElementsByTagName("span")[0]

    async function FetchPage(){
        if (!IsPurchasedGamesOpened){
            return
        }

        SetButtonStatus(NextPageButton, false)
        SetButtonStatus(PreviousPageButton, false)
        PageLabel.innerText = `Page ${CurrentPurchasedGamesPage}`

        const PurchasedGames = await GetPurchasedGames(CurrentPurchasedGamesPage)

        if (!IsPurchasedGamesOpened){
            return
        }

        CreateCardsFromPurchasedGames(PurchasedGames, ServerListElement)

        SetButtonStatus(NextPageButton, PurchasedGames.length >= 30)
        SetButtonStatus(PreviousPageButton, CurrentPurchasedGamesPage > 1)
    }

    PreviousPageButton.addEventListener("click", AddConnection(function(){
        CurrentPurchasedGamesPage--
        FetchPage()
    }, "click", PreviousPageButton))

    NextPageButton.addEventListener("click", AddConnection(function(){
        CurrentPurchasedGamesPage++
        FetchPage()
    }, "click", NextPageButton))

    DefaultPurchasedGamesCardElementObserver.observe(ServerListElement, {childList: true})

    FetchPage()
}

function CheckPurchasedGamesOpened(){
    // const TagLocation = window.location.href.split("#")[1] || ""
    // const IsURLOpen = TagLocation === "!/places/purchased-games"
    const IsURLOpen = window.location.href.search("tab=purchased-games") > -1

    if (IsURLOpen && !IsPurchasedGamesOpened){
        IsPurchasedGamesOpened = true
        PurchasedGamesOpened()
    } else if (!IsURLOpen && IsPurchasedGamesOpened) {
        DefaultPurchasedGamesCardElementObserver.disconnect()

        for (let i = 0; i < OpenPurchasedGamesConnections.length; i++){
            const Connection = OpenPurchasedGamesConnections[i]

            Connection.Element.removeEventListener(Connection.Type, Connection.Callback)
        }
        ClearPurchasedGamesCards()

        OpenPurchasedGamesConnections = []

        LoadingParagraph.style = "display:none;"

        const ServerListElement = FindFirstClass("hlist item-cards item-cards-embed ng-scope")
        if (ServerListElement) HideRobloxDefaultCards2(ServerListElement, false)//ClearAllChildren(ServerListElement)

        IsPurchasedGamesOpened = false
    }
}

window.addEventListener('popstate', CheckPurchasedGamesOpened)

const DefaultPurchasedGamesCardElementObserver = new MutationObserver(function(mutationList, observer){
    mutationList.forEach(function(mutation) {
      if (mutation.type === "childList") {
        const NewNodes = mutation.addedNodes

        for (let i = 0; i < NewNodes.length; i++){
            if (NewNodes[i].nodeType == Node.ELEMENT_NODE){
                HideDefaultCard2(NewNodes[i], true)
            }
        }
      }
    })
})

IsFeatureEnabled("PurchasedGamesFix").then(async function(Enabled){
    if (!Enabled) return

    let CategoriesList = await WaitForClass("menu-vertical submenus")

    let PlacesButton

    while (!PlacesButton){
        await sleep(100)
        PlacesButton = await GetButtonCategoryFromHref(CategoriesList, "places")
    }

    const Parent = PlacesButton.getElementsByTagName("div")[0].getElementsByTagName("ul")[0]
    const children = Parent.children

    let PurchasedPlacesButton

    for (let i = 0; i < children.length; i++){
        if (children[i].getAttribute("href") === "#!/places/purchased"){
            PurchasedPlacesButton = children[i]
            break
        }
    }

    if (!PurchasedPlacesButton) return

    PurchasedPlacesButton.remove()

    const [NewPurchasedPlacesButton] = CreateActivePrivateServersButton("Purchased", "#!/places?tab=purchased-games")
    Parent.insertBefore(NewPurchasedPlacesButton, Parent.nextSibiling)

    CheckPurchasedGamesOpened()
})