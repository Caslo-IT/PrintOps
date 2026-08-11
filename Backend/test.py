import re
import os
import math

def analyze_gcode(file_path):
    # Initialize tracking variables
    total_filament_mm = 0.0
    current_time_sec = 0.0
    
    current_layer = 0
    layer_filament_mm = 0.0
    layer_start_time_sec = 0.0
    
    layer_stats = []
    
    # Default values
    filament_diameter_mm = 1.75
    filament_density_g_cm3 = 1.10
    
    # Regular expressions
    e_pattern = re.compile(r'[ \t]E(-?\d*\.?\d+)') 
    time_pattern = re.compile(r';TIME_ELAPSED:(\d+\.?\d*)')
    header_diameter_pattern = re.compile(r'; filament_diameter:\s*(\d+\.?\d*)')
    header_density_pattern = re.compile(r'; filament_density:\s*(\d+\.?\d*)')
    
    if not os.path.exists(file_path):
        print(f"Error: The file '{file_path}' was not found.")
        return

    with open(file_path, 'r') as file:
        for line in file:
            # 1. Look for filament properties in the header
            dia_match = header_diameter_pattern.search(line)
            if dia_match:
                filament_diameter_mm = float(dia_match.group(1))
                
            den_match = header_density_pattern.search(line)
            if den_match:
                filament_density_g_cm3 = float(den_match.group(1))

            # 2. Update the elapsed time
            time_match = time_pattern.search(line)
            if time_match:
                current_time_sec = float(time_match.group(1))
                
            # 3. Calculate filament usage from movement commands
            if line.startswith(('G1', 'G2', 'G3')):
                e_match = e_pattern.search(line)
                if e_match:
                    e_val = float(e_match.group(1))
                    # Add ALL values. Retractions (-) and primes (+) will cancel out, 
                    # ensuring we only count net new filament leaving the nozzle.
                    layer_filament_mm += e_val
                    total_filament_mm += e_val
                        
            # 4. Detect layer changes to log data
            if line.startswith(';LAYER_CHANGE'):
                if current_layer > 0:
                    layer_time = current_time_sec - layer_start_time_sec
                    layer_stats.append({
                        'layer': current_layer,
                        'time_sec': layer_time,
                        'filament_mm': layer_filament_mm
                    })
                
                # Reset counters for the new layer
                current_layer += 1
                layer_filament_mm = 0.0
                layer_start_time_sec = current_time_sec
                
    # Add the final layer to the list
    if current_layer > 0:
        layer_time = current_time_sec - layer_start_time_sec
        layer_stats.append({
            'layer': current_layer,
            'time_sec': layer_time,
            'filament_mm': layer_filament_mm
        })
        
    # Formatting conversions for summary
    total_filament_m = total_filament_mm / 1000
    total_time_mins = current_time_sec / 60
    
    # Calculate Total Weight in Grams
    radius_cm = (filament_diameter_mm / 2) / 10
    length_cm = total_filament_mm / 10
    volume_cm3 = length_cm * math.pi * (radius_cm ** 2)
    total_weight_g = volume_cm3 * filament_density_g_cm3
    
    # Print the layer-by-layer breakdown
    print(f"\n{'Layer':<10} | {'Time (s)':<15} | {'Length (mm)':<15} | {'Weight (g)':<15}")
    print("-" * 65)
    for stat in layer_stats:
        layer_len_cm = stat['filament_mm'] / 10
        layer_vol_cm3 = layer_len_cm * math.pi * (radius_cm ** 2)
        layer_weight_g = layer_vol_cm3 * filament_density_g_cm3
        
        print(f"{stat['layer']:<10} | {stat['time_sec']:<15.2f} | {stat['filament_mm']:<15.2f} | {layer_weight_g:<15.2f}")
    
    # Print the final summary
    print("=" * 65)
    print(" G-CODE ANALYSIS SUMMARY")
    print("=" * 65)
    print(f"Total Print Time:      {total_time_mins:.2f} minutes ({current_time_sec:.2f} seconds)")
    print(f"Total Filament Length: {total_filament_mm:.2f} mm ({total_filament_m:.2f} meters)")
    print(f"Total Filament Weight: {total_weight_g:.2f} g")
    print(f"(Parameters Used: {filament_diameter_mm}mm diameter, {filament_density_g_cm3}g/cm³ density)")
    print("=" * 65)
    
    


# Replace with your actual file name
gcode_file = "paththini_1ft-figure_9h2m.gcode"
analyze_gcode(gcode_file)