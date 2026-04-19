# api/apps.py
import os
import joblib
import pandas as pd
from django.apps import AppConfig
from django.conf import settings


class ApiConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'api'

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Initialize instance attributes
        self.cosine_sim = None
        self.movie_indices = None
        self.movies_df = None
        self.vectorizer = None

    def ready(self):
        import sys

        # Skip during migrations
        if 'migrate' in sys.argv or 'makemigrations' in sys.argv:
            print("⏭️ Skipping ML model loading during migrations")
            return

        # Prevent multiple loading
        if self.cosine_sim is not None:
            print("✅ Models already loaded")
            return

        model_path = os.path.join(str(settings.BASE_DIR), 'ml_models')

        try:
            sim_file = os.path.join(model_path, 'movie_similarity.joblib')
            vec_file = os.path.join(model_path, 'movie_vectorizer.joblib')
            meta_file = os.path.join(model_path, 'movie_metadata.csv')

            if not os.path.exists(sim_file):
                print(f"❌ File not found: {sim_file}")
                return

            print("📂 Loading recommendation models...")
            self.cosine_sim = joblib.load(sim_file)
            self.vectorizer = joblib.load(vec_file)
            self.movies_df = pd.read_csv(meta_file)

            # Create title to index mapping
            self.movie_indices = {
                str(row['Title']).lower(): idx
                for idx, row in self.movies_df.iterrows()
            }

            print(f"✅ Loaded {len(self.movie_indices)} movies")
            print(f"✅ Similarity matrix shape: {self.cosine_sim.shape}")

        except Exception as e:
            print(f"❌ ML Model Load Failure: {e}")