import os
import pandas as pd
import numpy as np

# Raw data directory — 4th_test files live inside the 'txt' sub-folder
RAW_DATA_DIR = r"C:\BIPIN\CODES\Aegis\datasets_ziped\IMS\4th_test\txt"
OUTPUT_FILE   = r"C:\BIPIN\CODES\Aegis\datasets\nasa_test4_features.csv"

def extract_features(file_path):
    try:
        # 4th_test has 4 columns: Bearing 1, 2, 3, 4
        df = pd.read_csv(file_path, sep='\t', header=None)

        features = {}
        for col_idx in range(min(4, df.shape[1])):
            data = df.iloc[:, col_idx].values
            features[f"max_vibration_b{col_idx + 1}"]  = float(np.max(np.abs(data)))
            features[f"rms_vibration_b{col_idx + 1}"]  = float(np.sqrt(np.mean(data ** 2)))
            features[f"std_vibration_b{col_idx + 1}"]  = float(np.std(data))
            features[f"kurt_vibration_b{col_idx + 1}"] = float(
                pd.Series(data).kurtosis()
            )

        return features
    except Exception as e:
        print(f"  Skipping {os.path.basename(file_path)}: {e}")
        return None


def process_dataset():
    print("Starting NASA Test-4 data compression…")
    all_features = []

    file_names = sorted(os.listdir(RAW_DATA_DIR))
    total = len(file_names)
    print(f"  Found {total} files.")

    for i, file_name in enumerate(file_names):
        file_path = os.path.join(RAW_DATA_DIR, file_name)
        if not os.path.isfile(file_path):
            continue

        features = extract_features(file_path)
        if features:
            features["timestamp_id"] = file_name
            all_features.append(features)

        if (i + 1) % 100 == 0 or (i + 1) == total:
            print(f"  Processed {i + 1} / {total} files…")

    final_df = pd.DataFrame(all_features)

    # Reorder: timestamp first then feature columns
    cols = ["timestamp_id"] + [c for c in final_df.columns if c != "timestamp_id"]
    final_df = final_df[cols]

    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    final_df.to_csv(OUTPUT_FILE, index=False)
    print(f"\nSuccess! Saved {len(final_df)} rows → {OUTPUT_FILE}")
    print(final_df.head())


if __name__ == "__main__":
    process_dataset()
