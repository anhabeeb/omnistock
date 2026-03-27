import { Box, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";
import { SAFE_MUI_SELECT_PROPS } from "../lib/muiFocus";

interface MobileModuleStat {
  label: string;
  value: string;
  detail: string;
}

interface MobileModuleOption {
  value: string;
  label: string;
  description: string;
}

interface Props {
  eyebrow: string;
  title: string;
  description: string;
  activeValue: string;
  selectLabel: string;
  options: MobileModuleOption[];
  onChange: (value: string) => void;
  stats?: MobileModuleStat[];
}

export function MobileModuleShell({
  eyebrow,
  title,
  description,
  activeValue,
  selectLabel,
  options,
  onChange,
  stats = [],
}: Props) {
  const activeOption = options.find((option) => option.value === activeValue) ?? options[0];

  return (
    <Stack spacing={1.5}>
      <Paper sx={{ p: 2.25, borderRadius: 3.5 }}>
        <Stack spacing={1.25}>
          <Box>
            <Typography variant="overline" sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.16em" }}>
              {eyebrow}
            </Typography>
            <Typography variant="h5" sx={{ mt: 0.5 }}>
              {title}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
              {description}
            </Typography>
          </Box>

          {stats.length > 0 ? (
            <Box
              sx={{
                display: "grid",
                gap: 1,
                gridTemplateColumns: {
                  xs: "repeat(2, minmax(0, 1fr))",
                  sm: "repeat(auto-fit, minmax(140px, 1fr))",
                },
              }}
            >
              {stats.map((stat) => (
                <Paper key={stat.label} variant="outlined" sx={{ p: 1.5, borderRadius: 3 }}>
                  <Typography variant="caption" color="text.secondary">
                    {stat.label}
                  </Typography>
                  <Typography variant="h6" sx={{ mt: 0.35 }}>
                    {stat.value}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.35 }}>
                    {stat.detail}
                  </Typography>
                </Paper>
              ))}
            </Box>
          ) : null}
        </Stack>
      </Paper>

      <Paper sx={{ p: 1.75, borderRadius: 3.5 }}>
        <Stack spacing={1}>
          <TextField
            size="small"
            select
            label={selectLabel}
            value={activeValue}
            onChange={(event) => onChange(event.target.value)}
            SelectProps={SAFE_MUI_SELECT_PROPS}
            fullWidth
          >
            {options.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>
          {activeOption ? (
            <Typography variant="body2" color="text.secondary">
              {activeOption.description}
            </Typography>
          ) : null}
        </Stack>
      </Paper>
    </Stack>
  );
}
