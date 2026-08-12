"""G-code file analyzer for extracting filament usage, print time, and layer statistics."""

import math
from pathlib import Path
import re


def analyze_gcode(file_path: str | Path) -> dict:
    """Parse a G-code file and return summary metrics and layer statistics."""
    file_path = Path(file_path)
    if not file_path.exists():
        raise FileNotFoundError(f"G-code file '{file_path}' was not found.")

    total_filament_mm = 0.0
    current_time_sec = 0.0

    current_layer = 0
    layer_filament_mm = 0.0
    layer_start_time_sec = 0.0

    raw_layer_stats = []

    filament_diameter_mm = 1.75
    filament_density_g_cm3 = 1.10

    e_pattern = re.compile(r"[ \t]E(-?\d*\.?\d+)")
    time_pattern = re.compile(r";TIME_ELAPSED:(\d+\.?\d*)")
    header_diameter_pattern = re.compile(r"; filament_diameter:\s*(\d+\.?\d*)")
    header_density_pattern = re.compile(r"; filament_density:\s*(\d+\.?\d*)")

    with open(file_path, "r", encoding="utf-8", errors="ignore") as file:
        for line in file:
            dia_match = header_diameter_pattern.search(line)
            if dia_match:
                filament_diameter_mm = float(dia_match.group(1))

            den_match = header_density_pattern.search(line)
            if den_match:
                filament_density_g_cm3 = float(den_match.group(1))

            time_match = time_pattern.search(line)
            if time_match:
                current_time_sec = float(time_match.group(1))

            if line.startswith(("G1", "G2", "G3")):
                e_match = e_pattern.search(line)
                if e_match:
                    e_val = float(e_match.group(1))
                    layer_filament_mm += e_val
                    total_filament_mm += e_val

            if line.startswith(";LAYER_CHANGE"):
                if current_layer > 0:
                    layer_time = current_time_sec - layer_start_time_sec
                    raw_layer_stats.append({
                        "layer": current_layer,
                        "time_sec": layer_time,
                        "filament_mm": layer_filament_mm,
                    })

                current_layer += 1
                layer_filament_mm = 0.0
                layer_start_time_sec = current_time_sec

    if current_layer > 0:
        layer_time = current_time_sec - layer_start_time_sec
        raw_layer_stats.append({
            "layer": current_layer,
            "time_sec": layer_time,
            "filament_mm": layer_filament_mm,
        })

    radius_cm = (filament_diameter_mm / 2) / 10
    length_cm = total_filament_mm / 10
    volume_cm3 = length_cm * math.pi * (radius_cm**2)
    total_weight_g = volume_cm3 * filament_density_g_cm3

    formatted_layer_stats = []
    for stat in raw_layer_stats:
        layer_len_cm = stat["filament_mm"] / 10
        layer_vol_cm3 = layer_len_cm * math.pi * (radius_cm**2)
        layer_weight_g = layer_vol_cm3 * filament_density_g_cm3

        formatted_layer_stats.append({
            "layer": stat["layer"],
            "time_sec": round(stat["time_sec"], 2),
            "filament_mm": round(stat["filament_mm"], 2),
            "weight_g": round(layer_weight_g, 2),
        })

    return {
        "total_time_sec": round(current_time_sec, 2),
        "total_time_mins": round(current_time_sec / 60.0, 2),
        "total_filament_mm": round(total_filament_mm, 2),
        "total_filament_m": round(total_filament_mm / 1000.0, 2),
        "total_weight_g": round(total_weight_g, 2),
        "filament_diameter_mm": filament_diameter_mm,
        "filament_density_g_cm3": filament_density_g_cm3,
        "layer_count": len(formatted_layer_stats),
        "layer_stats": formatted_layer_stats,
    }
