let KnownSessions
let KnownSessionsUserId
let IPFailedSessions = {}
const GiveSessionChances = {}
const SessionButtonNotifications = {}
const NewSessionButtonNotifications = {}
const UsedNotificationIds = {}
const QueuedNotifications = []
let IsCheckingQueuedNotifications = false

function GenerateNotificationId(Length){
    let Id = ""

    while (true){
        const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
        const charactersLength = characters.length
        let counter = 0

        while (counter < Length) {
            Id += characters.charAt(Math.floor(Math.random() * charactersLength))
            counter += 1
        }

        if (!UsedNotificationIds[Id]) break
        Id = ""
    }

    return Id
}

async function QueueNotifications(Id, Notification, TTS){
    if (ManifestVersion == 2) delete Notification.buttons
    if (!chrome.tts) TTS = undefined
    if (!Notification && !TTS) return
    //Firefox does not support buttons nor TTS

    QueuedNotifications.push({Id: Id, Notification: Notification, TTS: TTS})

    if (!IsCheckingQueuedNotifications){
        IsCheckingQueuedNotifications = true

        while (QueuedNotifications.length > 0){
            const Queue = QueuedNotifications.splice(0, 1)[0]
            if (Queue.Notification && chrome.notifications?.create) chrome.notifications.create(Queue.Id, Queue.Notification)
            if (Queue.TTS){
                const Volume = await IsFeatureEnabled("NewLoginNotifierTTSVolume") || 1
                chrome.tts.speak(Queue.TTS, {volume: Volume})
            }

            await sleep(3000)
        }

        IsCheckingQueuedNotifications = false
    }
}

async function GetSavedKnownSessions(UserId){
    if (KnownSessions && KnownSessionsUserId === UserId) return [false, false]
    KnownSessionsUserId = UserId

    const SavedSessions = await LocalStorage.get("KnownSessions-"+UserId)
    if (SavedSessions){
        KnownSessions = JSON.parse(SavedSessions)
        return [true, false]
    } else {
        KnownSessions = {}
        return [true, true]
    }
}

async function SaveKnownSessions(UserId){
    LocalStorage.set("KnownSessions-"+UserId, JSON.stringify(KnownSessions))
}

async function GetLocationFromSession(Session){
    const ShowStateAndCountryOnly = await IsFeatureEnabled("ShowStateAndCountryOnNewSessionOnly")

    let Location = ""
    if (Session.location?.city && !ShowStateAndCountryOnly){
        Location = Session.location.city
    }
    if (Session.location?.subdivision){
        if (Location != "") Location += ", "
        Location += Session.location.subdivision
    }
    if (Session.location?.country){
        if (Location != "") Location += ", "
        Location += Session.location.country
    }
    if (Location == ""){
        Location = "Unknown Location"
    }
    return Location
}

function GetBrowserFromSession(Session){
    const Agent = Session.agent
    const Type = Agent?.type

    if (Agent?.value){
        return Agent?.value
    }

    if (Type == "Browser"){
        return "Unknown Browser"
    } else if (Type == "App"){
        return "Roblox App"
    } else if (Type == "Studio"){
        return "Roblox Studio"
    }
    
    return Type || "Unknown Browser"
}

async function LogoutSession(Session, TTS, LogoutCurrent, UserAction){
    let Success, Result, Response

    if (!LogoutCurrent) [Success, Result, Response] = await RequestFunc("https://apis.roblox.com/token-metadata-service/v1/logout", "POST", {["Content-Type"]: "application/json"}, JSON.stringify({token: Session.token}), true, false)
    else {
        [Success, Result, Response] = await RequestFunc("https://auth.roblox.com/v2/logout", "POST", undefined, undefined, true)
        if (!Success && Response?.status < 500 && ((UserAction && await IsFeatureEnabled("OpenNewTabIfRequiredHAB")) || (!UserAction && await IsFeatureEnabled("OpenNewTabIfRequiredJobsHAB")))){
            await chrome.tabs.create({url: "https://www.roblox.com/my/account#!/security", active: false})
            await WaitForRobloxPage()

            ;[Success, Result, Response] = await RequestFunc("https://auth.roblox.com/v2/logout", "POST", undefined, undefined, true)
        }
    }

    if (!Success && !LogoutCurrent){
        if (Response?.status == 400 && Result?.errors?.[0]?.message == "attempting to invalidate current token"){
            return await LogoutSession(Session, TTS, true)
        }
    }

    const ShowIP = await IsFeatureEnabled("ShowIPOnNewSession")

    const Title = Success && `Logged out of${LogoutCurrent && " current" || ""} session` || `Failed to log out of${LogoutCurrent && " current" || ""} session`
    let Message = `${Success && "Logged" || "Failed to log"} out of${LogoutCurrent && " current" || ""} session at ${await GetLocationFromSession(Session)}\nRunning ${GetBrowserFromSession(Session)} on ${Session.agent?.os || "Unknown OS"}`
    if (!Success) Message += `\n${Response?.status || "Unknown"} ${Response?.statusText || "Unknown"}`

    let TTSMessage
    if (TTS){
        if (await IsFeatureEnabled("OnlyReadNewLoginNotifierTitle")){
            TTSMessage = Title
        } else {
            TTSMessage = Message.replace("\n", ". ")
        }
    }

    QueueNotifications(null, {type: "basic",
    iconUrl: chrome.runtime.getURL("img/icons/icon128x128.png"),
    title: Title,
    message: Message,
    contextMessage: ShowIP && `IP: ${Session.lastAccessedIp || "Unknown"}` || "IP: HIDDEN (SETTINGS)",
    eventTime: Session.lastAccessedTimestampEpochMilliseconds && parseInt(Session.lastAccessedTimestampEpochMilliseconds)}, TTSMessage)
}

async function FetchCurrentIP(){
    const [Success, Result] = await RequestFunc("https://api.ipify.org/?format=json", "GET")
    return Success && Result.ip
}

async function CheckForNewSessions(){
    const DisallowOtherIPs = await IsFeatureEnabled("DisallowOtherIPs2")
    const NotificationEnabled = await IsFeatureEnabled("NewLoginNotifier3")
    const StrictlyDisallowOtherIPs = await IsFeatureEnabled("StrictlyDisallowOtherIPs2")
    const TTSEnabled = await IsFeatureEnabled("NewLoginNotifierTTS3")
    if (!NotificationEnabled && !DisallowOtherIPs && !StrictlyDisallowOtherIPs && !TTSEnabled) return

    const UserId = await GetCurrentUserId()
    if (!UserId) return

    const [Success, Result] = await RequestFunc("https://apis.roblox.com/token-metadata-service/v1/sessions?nextCursor=&desiredLimit=500", "GET", null, null, true)
    if (!Success) return

    const [IsFirstLoad, IsFirstScan] = await GetSavedKnownSessions(UserId)
    
    const NewSessions = []
    const NewKnownSessions = {}

    const Sessions = Result.sessions
    let CurrentIP = await FetchCurrentIP() //We should be getting current IP from external web request to get true device ip
    //We should also ignore isCurrentSession as that will not help when a user gets their cookie stolen instead
    //Decided not to ignore isCurrentSession UNLESS it is a strict disallow check. If strict disallow is on, it will check ALL sessions and if own session does not match own IP, it logs it out which invalidates our cookie.
    //Add failsafe incase we cannot get current ip.

    for (let i = 0; i < Sessions.length; i++){
        const Session = Sessions[i]

        if (!KnownSessions[Session.token] && !Session.lastAccessedIp && !GiveSessionChances[Session.token]){
            GiveSessionChances[Session.token] = {DoNotAlert: IsFirstLoad}
            Session.DoNotLogout = true
            NewSessions.push(Session)

            continue
        } else if (GiveSessionChances[Session.token]){
            Session.DoNotAlert = GiveSessionChances[Session.token].DoNotAlert
            delete GiveSessionChances[Session.token]
        }

        if (!KnownSessions[Session.token] && !Session.isCurrentSession) NewSessions.push(Session)
        NewKnownSessions[Session.token] = true
    }
    
    if (CurrentIP){
        IPFailedSessions = {}
    }

    KnownSessions = NewKnownSessions
    SaveKnownSessions(UserId)

    let KillCurrentSession
    const LogoutPromises = []

    if (StrictlyDisallowOtherIPs && CurrentIP){
        for (let i = 0; i < Sessions.length; i++){
            const Session = Sessions[i]
            if (Session.DoNotLogout) continue

            const SameIP = CurrentIP == Session.lastAccessedIp

            if (!SameIP){
                if (!Session.isCurrentSession) LogoutPromises.push(LogoutSession(Session, true))
                else KillCurrentSession = Session //Gotta do this as we have to complete the other requests before logging ourselves out!
            }
        }
    }

    let FirstLoadNewSessions = []
    if (!IsFirstScan && NewSessions.length > 0){
        const IgnoreSessionsFromSameIP = await IsFeatureEnabled("IgnoreSessionsFromSameIP")
        const ShowIP = await IsFeatureEnabled("ShowIPOnNewSession")
        
        for (let i = 0; i < NewSessions.length; i++){
            const Session = NewSessions[i]
            const SameIP = CurrentIP && CurrentIP == Session.lastAccessedIp

            if (SameIP && IgnoreSessionsFromSameIP){
                continue
            }

            let ShouldNotify = IPFailedSessions[Session.token] != true
            if (!SameIP && DisallowOtherIPs && !Session.DoNotLogout){
                if (CurrentIP){
                    LogoutPromises.push(LogoutSession(Session, true))
                    continue
                } else {
                    delete KnownSessions[Session.token]
                    IPFailedSessions[Session.token] = true
                    SaveKnownSessions()
                }
            }
            if (!ShouldNotify) continue

            if (IsFirstLoad){
                FirstLoadNewSessions.push(Session)
                continue
            }
            if (Session.DoNotAlert) continue

            const Location = await GetLocationFromSession(Session)

            const NotificationId = GenerateNotificationId(50)
            const Buttons = [{title: "Logout"}]
            SessionButtonNotifications[NotificationId] = {session: Session, buttons: Buttons}

            let TTSMessage
            if (TTSEnabled){
                if (await IsFeatureEnabled("OnlyReadNewLoginNotifierTitle")){
                    TTSMessage = `A new roblox login has been detected at ${Location}.`
                } else {
                    TTSMessage = `A new roblox login has been detected at ${Location}. Running ${GetBrowserFromSession(Session)} on ${Session.agent?.os || "Unknown OS"}`
                }
            }

            QueueNotifications(NotificationId,
                NotificationEnabled && {type: "basic",
                buttons: Buttons,
                iconUrl: chrome.runtime.getURL("img/icons/icon128x128.png"),
                title: "New Login for Roblox",
                message: `A new login has been detected at ${Location}\nRunning ${GetBrowserFromSession(Session)} on ${Session.agent?.os || "Unknown OS"}`,
                contextMessage: ShowIP && `IP: ${Session.lastAccessedIp || "Unknown"}` || "IP: HIDDEN (SETTINGS)",
                eventTime: Session.lastAccessedTimestampEpochMilliseconds && parseInt(Session.lastAccessedTimestampEpochMilliseconds)},
                TTSMessage)
        }
    }

    if (KillCurrentSession){
        let PromisesFinished = false
        setTimeout(function(){
            if (!PromisesFinished){
                PromisesFinished = true
                LogoutSession(KillCurrentSession, true)
            }
        }, 3*1000) //Wait for all promises with 3 second timeout

        await Promise.all(LogoutPromises)
        if (!PromisesFinished) LogoutSession(KillCurrentSession, true)
        PromisesFinished = true
    }

    if (IsFirstLoad && FirstLoadNewSessions.length > 0){
        const Buttons = [{title: "Show"}]
        const NotificationId = GenerateNotificationId(50)
        NewSessionButtonNotifications[NotificationId] = {sessions: FirstLoadNewSessions, buttons: Buttons}

        QueueNotifications(NotificationId,
            {type: "basic",
            buttons: Buttons,
            iconUrl: chrome.runtime.getURL("img/icons/icon128x128.png"),
            title: `New Login${FirstLoadNewSessions.length > 1 ? "s" : ""} for Roblox`,
            message: `${FirstLoadNewSessions.length} new session${FirstLoadNewSessions.length > 1 ? "s" : ""} have been created while you were gone. Would you like to see them?`})
    }
}

if (chrome.notifications?.onButtonClicked) chrome.notifications.onButtonClicked.addListener(async function(NotificationId, ButtonIndex){
    const Notification = NewSessionButtonNotifications[NotificationId]
    if (!Notification) return

    const Button = Notification.buttons[ButtonIndex]
    if (Button.title === "Show"){
        const Sessions = Notification.sessions
        const ShowIP = await IsFeatureEnabled("ShowIPOnNewSession")

        for (let i = 0; i < Sessions.length; i++){
            const Session = Sessions[i]
            const Location = await GetLocationFromSession(Session)

            const NewNotificationId = GenerateNotificationId(50)
            const NewButtons = [{title: "Logout"}]
            SessionButtonNotifications[NewNotificationId] = {session: Session, buttons: NewButtons}

            QueueNotifications(NewNotificationId,
                {type: "basic",
                buttons: NewButtons,
                iconUrl: chrome.runtime.getURL("img/icons/icon128x128.png"),
                title: "New Login for Roblox",
                message: `A new login has been detected at ${Location}\nRunning ${GetBrowserFromSession(Session)} on ${Session.agent?.os || "Unknown OS"}`,
                contextMessage: ShowIP && `IP: ${Session.lastAccessedIp || "Unknown"}` || "IP: HIDDEN (SETTINGS)",
                eventTime: Session.lastAccessedTimestampEpochMilliseconds && parseInt(Session.lastAccessedTimestampEpochMilliseconds)})
        }
    }
})

if (chrome.notifications?.onButtonClicked) chrome.notifications.onButtonClicked.addListener(async function(NotificationId, ButtonIndex){
    const Notification = SessionButtonNotifications[NotificationId]
    if (!Notification) return

    const Button = Notification.buttons[ButtonIndex]
    if (Button.title === "Logout"){
        LogoutSession(Notification.session, undefined, undefined, true)
    }
})

if (chrome.notifications?.onClicked) chrome.notifications.onClicked.addListener(function(NotificationId){
    const Notification = SessionButtonNotifications[NotificationId]
    if (!Notification) return

    chrome.tabs.create({url: "https://www.roblox.com/my/account#!/security"})
})

if (chrome.notifications?.onClosed) chrome.notifications.onClosed.addListener(function(NotificationId, byUser){
    if (byUser){
        delete SessionButtonNotifications[NotificationId]
        delete NewSessionButtonNotifications[NotificationId]
        delete TradeNotifications[NotificationId]
        delete UsedNotificationIds[NotificationId]
        delete GroupShoutNotifications[NotificationId]
    }
})

CheckForNewSessions()
setInterval(CheckForNewSessions, 5*1000)