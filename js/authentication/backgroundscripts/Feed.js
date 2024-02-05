let HaveFetchedFeed = false
const Feed = {}
let FeedList = []

async function GetFeed(AuthKey){
    if (HaveFetchedFeed) return true

    const [Success, Result] = await RequestFunc(WebServerEndpoints.Feed, "GET", {Authentication: AuthKey})
    if (!Success) return false
    
    for (let i = 0; i < Result.length; i++){
        const Group = Result[i]
        if (Feed[Group.Group]) continue
        Feed[Group.Group] = Group
    }
    FeedList = Result
    HaveFetchedFeed = true

    return true
}

async function FeedGroupShoutChanged(Group, AuthKey){
    const Feed = {
        Group: Group.id,
        Comment: Group.shout.body,
        Poster: Group.shout.poster.userId,
        Date: Math.floor(new Date(Group.shout.updated).getTime()/1000),
    }

    const [Success] = await RequestFunc(WebServerEndpoints.Feed+"add", "POST", {"Content-Type": "application/json", Authentication: AuthKey}, JSON.stringify(Feed))
    if (!Success) return [false]
    if (FeedList.unshift(Feed) > 200) FeedList.length = 200

    return [true, Feed]
}

async function UpdateFeed(){
    const FeedEnabled = await IsFeatureEnabled("Feed")
    const GroupShoutNotifications = await IsFeatureEnabled("GroupShoutNotifications")
    const AllShoutNotificationsEnabled = GroupShoutNotifications.Enabled && GroupShoutNotifications.Joined

    if (!FeedEnabled && !AllShoutNotificationsEnabled) return

    const [AuthKey, UserId] = await GetAuthKeyDetailed()
    if (!UserId || !AuthKey){
        setTimeout(UpdateFeed, 60*1000)
        return
    }
    if (FeedEnabled) if (!await GetFeed(AuthKey)) return

    const [Success, Groups] = await RequestFunc(`https://groups.roblox.com/v1/users/${UserId}/groups/roles`, "GET", undefined, undefined, true)
    if (!Success) return

    const Data = Groups.data
    for (let i = 0; i < Data.length; i++){
        const [Success, Body] = await RequestFunc(`https://groups.roblox.com/v1/groups/${Data[i].group.id}`, "GET", undefined, undefined, true)
        if (Success && await GetCurrentUserId() === UserId){
            const Shout = Body.shout
            const Prior = Feed[Body.id]?.Date

            if (AllShoutNotificationsEnabled) CheckForNewGroupShoutNotification(Body)
            if (!Shout){
                await sleep(5000)
                continue
            }
            const Updated = Math.floor(new Date(Shout.updated).getTime()/1000)

            if (Shout && Shout.body !== "" && Prior !== Updated){
                if (Feed){
                    if (!Prior){ //Check if we have no room for this since its too old
                        const Timestamp = FeedList[FeedList.length-1]?.Date
                        if (Timestamp && Timestamp > Updated){
                            await sleep(5000)
                            continue //Too old
                        }
                    }

                    const [Success, Result] = await FeedGroupShoutChanged(Body, AuthKey)
                    if (Success) Feed[Body.id] = Result
                }
            }
        }
        await sleep(5000)
    }
    setTimeout(UpdateFeed, 60*1000)
}

UpdateFeed()