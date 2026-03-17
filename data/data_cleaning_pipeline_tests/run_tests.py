#!/usr/bin/env python3
"""
Simple test runner for the data cleaning pipeline tests.
This script provides an easy way to run the tests with proper output formatting.
"""

import sys
import os
from pathlib import Path
import subprocess
import time
import pandas
import numpy
import bs4
import emoji
import contractions

# Run the complete test suite for the data cleaning pipeline
def run_tests():
    script_dir = Path(__file__).parent
    os.chdir(script_dir)

    print("\n" + "="*60)
    print("Starting Data Cleaning Test Script")
    print("="*60)

    # Run the main test file
    result = subprocess.run([
        sys.executable, "test_data_cleaning_pipeline.py"
    ])
    
    
    # Print only the PASS messages
    if result.stdout:
        lines = result.stdout.split('\n')
        pass_messages = [line for line in lines if line.startswith('PASS -')]
        if pass_messages:
            print("\nTest Results:")
            print("-" * 40)
            for msg in pass_messages:
                print(msg)
    
    # Report the overall test execution status
    if result.returncode == 0:
        print("\nAll tests passed successfully!")
    else:
        print("Tests failed")
        print(f"Return code: {result.returncode}")
    
    return result.returncode == 0

# Main entry point for the test runner
def main():
    success = run_tests()
    
    # Display final status message
    print("\n" + "="*60)
    if success:
        print("Data Cleaning Test Script executed Successfully!")
    else:
        print("Data Cleaning Test Script Failed!")
    print("="*60)
    
    # Return exit code 
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())
