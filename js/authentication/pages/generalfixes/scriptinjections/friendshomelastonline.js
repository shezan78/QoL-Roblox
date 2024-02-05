let PendingLastOnlineBatches = []

async function BatchGetLastOnline(UserId){
    return new Promise(async(resolve, reject) => {
        PendingLastOnlineBatches.push({UserId: UserId, resolve: resolve, reject: reject})

        if (PendingLastOnlineBatches.length === 1){
            await new Promise(r => setTimeout(r, 100))
            const Batch = PendingLastOnlineBatches
            PendingLastOnlineBatches = []

            const UserIds = []
            const UserIdToResolve = {}

            for (let i = 0; i < Batch.length; i++){
                const Request = Batch[i]
                
                if (!UserIdToResolve[Request.UserId]){
                    UserIds.push(Request.UserId)
                    UserIdToResolve[Request.UserId] = []
                }
                UserIdToResolve[Request.UserId].push(Request)
            }

            for (let i = 0; i < 3; i++){
                const Response = await fetch("https://presence.roblox.com/v1/presence/last-online", {method: "POST", headers: {"Content-Type": "application-json"}, body: JSON.stringify({userIds: UserIds}), credentials: "include"})
                const Success = Response.ok
                let Result

                if (Success){
                    try {
                        Result = await Response.json()
                    } catch {}
                }
                
                if (!Success) {
                    await new Promise(r => setTimeout(r, 1500))
                    continue
                }

                const Timestamps = Result.lastOnlineTimestamps
                for (let i = 0; i < Timestamps.length; i++){
                    const User = Timestamps[i]
                    const Resolves = UserIdToResolve[User.userId]
                    for (let i = 0; i < Resolves.length; i++){
                        Resolves[i].resolve(User.lastOnline)
                    }
                }
                return
            }

            for (const [_, Resolves] of Object.entries(UserIdToResolve)) {
                for (let i = 0; i < Resolves.length; i++){
                    Resolves[i].reject()
                }
            }
        }
    })
}

async function FriendsHomeLastOnline(){
    function SecondsToLengthSingle(Seconds){
        const d = Math.floor(Seconds / (3600*24))
        const h = Math.floor(Seconds % (3600*24) / 3600)
        const m = Math.floor(Seconds % 3600 / 60)
        const s = Math.floor(Seconds % 60)
      
        if (d > 0){
          return `${d} day${d == 1 ? "" : "s"}`
        } else if (h > 0){
          return `${h} hour${h == 1 ? "" : "s"}`
        } else if (m > 0){
          return `${m} minute${m == 1 ? "" : "s"}`
        }
      
        return `${s} second${s == 1 ? "" : "s"}`
      }

    function GetPlaceName(Child){
        const Existing = Child.getElementsByClassName("place-name")[0]
        if (Existing) return [Existing, false]

        const PlaceName = document.createElement("div")
        PlaceName.className = "text-overflow xsmall text-label place-name"
        Child.getElementsByClassName("friend-link")[0].appendChild(PlaceName)

        return [PlaceName, true]
    }

    const OfflineUsers = {}
    const CachedPresence = {}

    async function UpdateItem(UserId, FriendItem, Time){
        const LastOnline = new Date(await BatchGetLastOnline(UserId))
        const [PlaceName, Created] = GetPlaceName(FriendItem)

        while (OfflineUsers[UserId] === Time){
            PlaceName.innerText = SecondsToLengthSingle((Date.now()/1000) - (LastOnline.getTime()/1000)) + " ago"
            await new Promise(r => setTimeout(r, 500))
        }
        if (Created) PlaceName.remove()
    }

    async function SetUserOffline(Presence){
        const UserId = Presence.userId || Presence.id
        const Time = Date.now()
        OfflineUsers[UserId] = Time
        CachedPresence[UserId] = Presence

        const FriendItem = document.getElementById("people-"+UserId)
        const BestFriendItem = document.getElementById("best-friend-"+UserId)

        if (FriendItem) UpdateItem(UserId, FriendItem, Time)
        if (BestFriendItem) UpdateItem(UserId, BestFriendItem, Time)
    }

    async function SetUserOnline(Presence){
        const UserId = Presence.userId || Presence.id
        CachedPresence[UserId] = Presence
        delete OfflineUsers[UserId]
    }

    document.addEventListener("RobloxQoL.BestFriendsLoaded", function(){
        const Container = document.getElementById("best-friend-list-container")
        const List = Container.getElementsByClassName("hlist")[0]
        const Children = List.children

        for (let i = 0; i < Children.length; i++){
            const Element = Children[i]
            const UserId = parseInt(Element.getAttribute("rbx-user-id"))
            const Presence = CachedPresence[UserId]
            if (Presence && Presence.userPresenceType === 0) SetUserOffline(Presence)
        }
    })

    document.addEventListener("Roblox.Presence.Update", async function(Event){
        const Presence = Event.detail[0]
        if (Presence.userPresenceType === 0) SetUserOffline(Presence)
        else SetUserOnline(Presence)
    })

    let PeopleList
    while (true){
        PeopleList = document.querySelector('[ng-controller="peopleListContainerController"]')
        if (PeopleList) break
        await new Promise(r => setTimeout(r, 100))
    }

    const PeopleController = angular.element(PeopleList).scope()
    while (PeopleController.library?.numOfFriends === null) await new Promise(r => setTimeout(r, 100))

    function UpdateAllPresences(){
        for (const [_, User] of Object.entries(PeopleController.library.friendsDict)){
            if (User.presence.userPresenceType === 0) SetUserOffline(User)
            else SetUserOnline(User)
        }
    }

    UpdateAllPresences()
}
FriendsHomeLastOnline()