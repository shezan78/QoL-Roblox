function IsFeatureEnabled(Feature){
    return new Promise(async(resolve) => {
        function OnEvent(e){
            document.removeEventListener("RobloxQoL.IsFeatureEnabledResponse", OnEvent)
            resolve(e?.detail)
        }

        document.addEventListener("RobloxQoL.IsFeatureEnabledResponse", OnEvent)

        document.dispatchEvent(new CustomEvent("RobloxQoL.IsFeatureEnabled", {detail: Feature}))
    })
}

IsFeatureEnabled("ViewOffsaleItems").then(function(Enabled){
    if (!Enabled) return

    const InterceptURL = "https://apis.roblox.com/toolbox-service/v1/items/details?assetIds="

    const _fetch = fetch
    window.fetch = async function(...args){
        const response = await _fetch(...args)

        if (response.ok || response.status !== 404 && response.url.substring(0, InterceptURL.length) !== InterceptURL) return response

        const Data = []
        const AssetIds = response.url.substring(InterceptURL.length, response.url.length).split(",")

        for (let i = 0; i < AssetIds.length; i++){
            const AssetId = parseInt(AssetIds[i])
            const Response = await _fetch(`https://economy.roblox.com/v2/assets/${AssetId}/details`, {method: "GET", credentials: "include"})
            if (!Response.ok) continue

            const Result = await Response.json()

            Data.push({
                asset: {
                    assetGenres: ["All"],
                    assetSubTypes: [],
                    createdUtc: Result.Created,
                    updatedUtc: Result.Updated,
                    description: Result.Description,
                    duration: 0,
                    id: AssetId,
                    isAssetHashApproved: true,
                    isEndorsed: false,
                    name: Result.Name,
                    typeId: Result.AssetTypeId
                },
                creator: {
                    name: Result.Creator.Name,
                    type: Result.Creator.CreatorType === "User" ? 1 : 2,
                    isVerifiedCreator: true,//Result.Creator.HasVerifiedBadge,
                    id: Result.Creator.CreatorTargetId
                },
                voting: {
                    canVote: false,
                    downVotes: 0,
                    hasVoted: false,
                    showVotes: false,
                    upVotePercent: 0,
                    upVotes: 0,
                    voteCount: 0
                }
            })
        }

        return new Response(JSON.stringify({data: Data}), {status: 200, headers: {"Content-Type": "application/json"}})
    }
})