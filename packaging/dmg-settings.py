"""Finder presentation for the PowerBrix Launcher disk image."""

app = defines["app"]
files = [app]
symlinks = {"Applications": "/Applications"}
background = defines["background"]
icon = defines["icon"]
format = "UDZO"
window_rect = ((180, 155), (800, 460))
icon_size = 96
text_size = 13
icon_locations = {
    "Applications": (202, 224),
    "PowerBrix Launcher.app": (598, 224),
}
