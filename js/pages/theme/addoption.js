async function AddSystemThemeOption(){
    const List = await WaitForId("themes-list")
    const InputField = await WaitForClassPath(List, "input-field")

    const SystemOption = document.createElement("option")
    SystemOption.label = "System"
    SystemOption.value = "string:System"
    SystemOption.innerText = "System"
    InputField.appendChild(SystemOption)

    document.addEventListener("RobloxQoLThemeChange", function(e){
        SetFeatureEnabled("SetThemeToSystem2", e.detail === "System")
    })

    if (IsFeatureEnabled("SetThemeToSystem2")) {
        while (InputField.value === "?") await sleep(0)
        InputField.value = "string:System"
    }

    InjectScript("intercepttheme")
}

setTimeout(AddSystemThemeOption, 0)