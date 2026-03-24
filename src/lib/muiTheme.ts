import { alpha, createTheme, responsiveFontSizes, type PaletteMode } from "@mui/material/styles";

const lightPalette = {
  background: "#f4f7fd",
  paper: "#ffffff",
  surface: "#f8fbff",
  sidebar: "#fbfdff",
  textPrimary: "#14213d",
  textSecondary: "#52607a",
  border: "rgba(148, 163, 184, 0.22)",
  shadow: "0 18px 50px rgba(15, 23, 42, 0.08)",
};

const darkPalette = {
  background: "#07111f",
  paper: "#101a2f",
  surface: "#111f37",
  sidebar: "#091325",
  textPrimary: "#edf3ff",
  textSecondary: "#9fb0cc",
  border: "rgba(71, 85, 105, 0.52)",
  shadow: "0 24px 64px rgba(0, 0, 0, 0.34)",
};

export function buildMuiTheme(mode: PaletteMode) {
  const palette = mode === "dark" ? darkPalette : lightPalette;

  return responsiveFontSizes(
    createTheme({
      palette: {
        mode,
        primary: {
          main: "#2563eb",
          light: "#60a5fa",
          dark: "#1d4ed8",
          contrastText: "#ffffff",
        },
        secondary: {
          main: "#0f172a",
          light: "#1e293b",
          dark: "#020617",
          contrastText: "#ffffff",
        },
        success: {
          main: "#1d8f5c",
        },
        warning: {
          main: "#d97706",
        },
        error: {
          main: "#e11d48",
        },
        background: {
          default: palette.background,
          paper: palette.paper,
        },
        text: {
          primary: palette.textPrimary,
          secondary: palette.textSecondary,
        },
        divider: palette.border,
      },
      shape: {
        borderRadius: 18,
      },
      typography: {
        fontFamily: '"Plus Jakarta Sans", "Segoe UI Variable Text", "Segoe UI", sans-serif',
        h1: {
          fontFamily: '"Sora", "Plus Jakarta Sans", sans-serif',
          fontWeight: 700,
          letterSpacing: "-0.04em",
        },
        h2: {
          fontFamily: '"Sora", "Plus Jakarta Sans", sans-serif',
          fontWeight: 700,
          letterSpacing: "-0.03em",
        },
        h3: {
          fontFamily: '"Sora", "Plus Jakarta Sans", sans-serif',
          fontWeight: 700,
          letterSpacing: "-0.03em",
        },
        button: {
          fontWeight: 700,
          textTransform: "none",
          letterSpacing: "-0.01em",
        },
      },
      components: {
        MuiCssBaseline: {
          styleOverrides: {
            ":root": {
              colorScheme: mode,
            },
            body: {
              backgroundImage:
                mode === "dark"
                  ? "radial-gradient(circle at top left, rgba(37, 99, 235, 0.16), transparent 24%), radial-gradient(circle at top right, rgba(59, 130, 246, 0.12), transparent 24%), linear-gradient(180deg, #07111f, #0b1630)"
                  : "radial-gradient(circle at top left, rgba(37, 99, 235, 0.12), transparent 24%), radial-gradient(circle at top right, rgba(59, 130, 246, 0.1), transparent 24%), linear-gradient(180deg, #f4f7fd, #eef4ff)",
            },
          },
        },
        MuiPaper: {
          styleOverrides: {
            root: {
              backgroundImage: "none",
              border: `1px solid ${palette.border}`,
              boxShadow: palette.shadow,
            },
          },
        },
        MuiCard: {
          styleOverrides: {
            root: {
              border: `1px solid ${palette.border}`,
              boxShadow: palette.shadow,
              backgroundImage: "none",
            },
          },
        },
        MuiAppBar: {
          styleOverrides: {
            root: {
              backgroundImage: "none",
              backdropFilter: "blur(18px)",
              border: `1px solid ${palette.border}`,
              boxShadow: palette.shadow,
            },
          },
        },
        MuiDrawer: {
          styleOverrides: {
            paper: {
              backgroundColor: palette.sidebar,
              borderColor: palette.border,
              backgroundImage: "none",
            },
          },
        },
        MuiButton: {
          defaultProps: {
            disableElevation: true,
          },
          styleOverrides: {
            root: {
              borderRadius: 16,
              minHeight: 42,
              paddingInline: 18,
            },
          },
        },
        MuiIconButton: {
          styleOverrides: {
            root: {
              borderRadius: 14,
              border: `1px solid ${palette.border}`,
              backgroundColor: alpha(mode === "dark" ? "#ffffff" : "#0f172a", mode === "dark" ? 0.04 : 0.02),
            },
          },
        },
        MuiChip: {
          styleOverrides: {
            root: {
              borderRadius: 999,
              fontWeight: 700,
            },
          },
        },
        MuiOutlinedInput: {
          styleOverrides: {
            root: {
              borderRadius: 16,
              backgroundColor: alpha(mode === "dark" ? "#ffffff" : "#0f172a", mode === "dark" ? 0.04 : 0.02),
            },
          },
        },
        MuiTableCell: {
          styleOverrides: {
            head: {
              fontWeight: 800,
              fontSize: "0.75rem",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            },
          },
        },
        MuiListItemButton: {
          styleOverrides: {
            root: {
              borderRadius: 16,
            },
          },
        },
        MuiMenu: {
          styleOverrides: {
            paper: {
              borderRadius: 20,
            },
          },
        },
      },
    }),
  );
}

