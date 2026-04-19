# accounts/management/commands/import_movies.py
import pandas as pd
from django.core.management.base import BaseCommand
from accounts.models import Movies
from django.conf import settings
import os


class Command(BaseCommand):
    help = 'Import movies from CSV to database'

    def handle(self, *args, **options):
        csv_path = os.path.join(str(settings.BASE_DIR), 'ml_models', 'movie_metadata.csv')
        self.stdout.write(f"Loading movies from: {csv_path}")

        df = pd.read_csv(csv_path)
        self.stdout.write(f"Found {len(df)} movies in CSV")

        imported = 0
        skipped = 0

        for _, row in df.iterrows():
            try:
                movie_id = str(row['id']).strip()  # keep as 'tt0099785'

                vote_count = int(float(str(row['Votes_numeric']).strip()))
                vote_average = float(str(row['Rating']).strip())

                Movies.objects.update_or_create(
                    movie_id=movie_id,
                    defaults={
                        'title': str(row['Title']).strip(),
                        'vote_average': vote_average,
                        'vote_count': vote_count,
                        'directors': str(row['directors_clean']).strip(),
                        'genres': str(row['genres_clean']).strip(),
                    }
                )
                imported += 1

                if imported % 1000 == 0:
                    self.stdout.write(f"Imported {imported} movies...")

            except Exception as e:
                self.stdout.write(self.style.ERROR(f"Error importing '{row.get('Title', '?')}': {e}"))
                skipped += 1

        self.stdout.write(self.style.SUCCESS(
            f"\n✅ Done! Imported: {imported}, Skipped: {skipped}, Total: {len(df)}"
        ))