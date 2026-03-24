import { Button, Paper, Stack, alpha, useTheme } from "@mui/material";
import { useLocation, useNavigate } from "react-router-dom";

interface ModuleSubnavItem {
  label: string;
  to: string;
}

interface Props {
  items: ModuleSubnavItem[];
}

export function ModuleSubnav({ items }: Props) {
  const theme = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <Paper
      sx={{
        p: 1,
        borderRadius: 3.5,
        position: { xs: "sticky", lg: "static" },
        top: { xs: 88, lg: "auto" },
        zIndex: 6,
        bgcolor:
          theme.palette.mode === "dark"
            ? alpha(theme.palette.background.paper, 0.86)
            : alpha(theme.palette.background.paper, 0.88),
      }}
    >
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
        {items.map((item) => {
          const active = location.pathname === item.to;
          return (
            <Button
              key={item.to}
              variant={active ? "contained" : "text"}
              color={active ? "primary" : "inherit"}
              onClick={() => navigate(item.to)}
              sx={{
                minHeight: 42,
                borderRadius: 2.5,
                px: 2,
                color: active ? "primary.contrastText" : "text.secondary",
              }}
            >
              {item.label}
            </Button>
          );
        })}
      </Stack>
    </Paper>
  );
}
