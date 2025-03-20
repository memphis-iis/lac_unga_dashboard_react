import sys
import pandas as pd

def normalize_columns(df):
    df.columns = [col.upper() if col.lower() == 'iso3' else col.capitalize() if col.lower() == 'year' else col for col in df.columns]
    return df

def append_csv(file1, file2, output_file):
    df1 = pd.read_csv(file1)
    df2 = pd.read_csv(file2)

    df1 = normalize_columns(df1)
    df2 = normalize_columns(df2)

    combined_df = pd.concat([df1, df2], ignore_index=True, sort=False)

    # Group by 'Year' and 'ISO3' and aggregate the rows
    combined_df = combined_df.groupby(['Year', 'ISO3'], as_index=False).sum()

    combined_df.to_csv(output_file, index=False)

if __name__ == "__main__":
    if len(sys.argv) != 4:
        print("Usage: python appendcsv.py <path to first csv file> <path to second csv file> <path to output csv file>")
        sys.exit(1)

    file1 = sys.argv[1]
    file2 = sys.argv[2]
    output_file = sys.argv[3]

    append_csv(file1, file2, output_file)
