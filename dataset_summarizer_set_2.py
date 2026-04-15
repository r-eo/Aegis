import os
import pandas as pd
import numpy as np

# Point this strictly to the folder for Test Run 2
RAW_DATA_DIR = "C:\BIPIN\CODES\Aegis\datasets_ziped\IMS\4th_test" 
OUTPUT_FILE = "nasa_test2_features.csv"

def extract_features(file_path):
    try:
        # Test Run 2 has 4 columns: Bearing 1, Bearing 2, Bearing 3, Bearing 4
        df = pd.read_csv(file_path, sep='\t', header=None)
        
        # We only care about Bearing 1 (Column 0) because we know it fails in this test
        bearing_1_data = df.iloc[:, 0].values
        
        # Calculate our sliding window features
        max_vib = np.max(np.abs(bearing_1_data))
        rms_vib = np.sqrt(np.mean(bearing_1_data**2))
        
        return {
            "max_vibration": max_vib,
            "rms_vibration": rms_vib
        }
    except Exception as e:
        print(f"Skipping {file_path}: {e}")
        return None
    
    
def process_dataset():
    print("Starting NASA data compression...")
    all_features = []
    
    
    file_names = sorted(os.listdir(RAW_DATA_DIR))
    
    for i, file_name in enumerate(file_names):
        file_path = os.path.join(RAW_DATA_DIR, file_name)
        
        
        features = extract_features(file_path)
        
        if features:
            
            features["timestamp_id"] = file_name 
            all_features.append(features)
            
        if i % 100 == 0:
            print(f"Processed {i} / {len(file_names)} files...")

    
    final_df = pd.DataFrame(all_features)
    
   
    final_df = final_df[["timestamp_id", "max_vibration", "rms_vibration"]]
    
    
    final_df.to_csv(OUTPUT_FILE, index=False)
    print(f"Success! Saved compressed dataset to {OUTPUT_FILE}")

if __name__ == "__main__":
    process_dataset()

