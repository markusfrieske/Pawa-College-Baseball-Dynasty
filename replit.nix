{pkgs}: {
  deps = [
    pkgs.glib
    pkgs.gdk-pixbuf
    pkgs.cairo
    pkgs.pango
    pkgs.gtk3
    pkgs.at-spi2-core
    pkgs.at-spi2-atk
    pkgs.cups
    pkgs.alsa-lib
    pkgs.nspr
    pkgs.nss
    pkgs.libxkbcommon
    pkgs.xorg.libXrandr
    pkgs.xorg.libXfixes
    pkgs.xorg.libXext
    pkgs.xorg.libXdamage
    pkgs.xorg.libXcomposite
    pkgs.xorg.libX11
    pkgs.xorg.libxcb
    pkgs.chromium
  ];
}
