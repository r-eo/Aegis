import pandas as pd

# 1. Load your specific CWRU feature dataset
df = pd.read_csv(r"C:\BIPIN\CODES\Aegis\datasets\feature_time_48k_2048_load_1.csv")

# 2. Separate the "fault" column (the labels) from the training features.
# We drop it from the main dataframe, but save it to 'y_labels' just in case 
# you want to use it later to prove your model's accuracy to the judges.
X_features = df.drop(columns=["fault"])
y_labels = df["fault"]

# 3. Optional but recommended: Save the "clean" unsupervised version to a new file
# so your FastAPI server can easily load it without dropping columns every time.
clean_filename = "cwru_unsupervised_features.csv"
X_features.to_csv(clean_filename, index=False)

print(f"Successfully removed the 'fault' column!")
print(f"Saved clean dataset to: {clean_filename}")
print(f"Remaining training features: {X_features.columns.tolist()}")