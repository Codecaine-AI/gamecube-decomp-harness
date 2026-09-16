import hashlib
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from mediawiki_mirror import LocalLinks, Mirror, filename, media_valid


class MirrorTests(unittest.TestCase):
    def test_optimized_media_retries_original_without_weakening_hash_check(self):
        with tempfile.TemporaryDirectory() as directory:
            config = {'identity': {'upstream': 'https://example.org'}, 'configuration': {'scope': {
                'api': 'https://example.org/api.php'}}}
            mirror = Mirror(config, Path(directory))
            row = {'title': 'File:A.png', 'url': 'https://example.org/a.png',
                   'path': 'media/a.png', 'bytes': 8, 'sha1': hashlib.sha1(b'original').hexdigest()}
            urls = []
            def request(url):
                urls.append(url)
                return io.BytesIO(b'original' if 'gamekeep_original=' in url else b'polished')
            mirror.request = request
            with patch('mediawiki_mirror.time.sleep'):
                mirror.download(row)
            self.assertEqual(len(urls), 2)
            self.assertEqual((Path(directory) / row['path']).read_bytes(), b'original')
            self.assertFalse((Path(directory) / (row['path'] + '.part')).exists())

    def test_title_paths_do_not_collide_or_escape(self):
        titles = ['A/B', 'A:B', 'A B', 'A_B', '../../A/B']
        self.assertEqual(len({filename(t) for t in titles}), len(titles))
        for title in titles:
            self.assertNotIn('/', filename(title))

    def test_existing_media_requires_content_hash(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'image'
            row = {'bytes': 7, 'sha1': hashlib.sha1(b'correct').hexdigest()}
            output.write_bytes(b'correct')
            self.assertTrue(media_valid(output, row))
            output.write_bytes(b'corrupt')
            self.assertFalse(media_valid(output, row))
            output.write_bytes(b'cor')
            self.assertFalse(media_valid(output, row))

    def test_category_walk_handles_cycles_and_non_article_namespaces(self):
        with tempfile.TemporaryDirectory() as directory:
            config = {'identity': {'upstream': 'https://example.org'}, 'configuration': {'scope': {
                'api': 'https://example.org/api.php', 'seed_categories': ['Category:A'], 'seed_pages': []}}}
            mirror = Mirror(config, Path(directory))
            members = {
                'Category:A': [{'ns': 14, 'title': 'Category:B'}, {'ns': 102, 'title': 'Gallery:A'}],
                'Category:B': [{'ns': 14, 'title': 'Category:A'}, {'ns': 6, 'title': 'File:A.png'}, {'ns': 106, 'title': 'Multimedia:A'}],
            }
            mirror.category = lambda category: (category, members[category])
            result = mirror.discover()
            self.assertEqual(result['categories'], ['Category:A', 'Category:B'])
            self.assertIn('Gallery:A', result['pages'])
            self.assertIn('Multimedia:A', result['pages'])
            self.assertEqual(result['media'], ['File:A.png'])

    def test_offline_links_keep_anchors_and_replace_thumbnails(self):
        parser = LocalLinks('https://example.org', {'Mario': 'html/Mario.html'}, {'SMS image.png': 'media/image.png'})
        parser.feed('<a href="/Mario#Sunshine">Mario</a><img src="https://cdn.example.org/images/thumb/a/ab/SMS_image.png/200px-SMS_image.png" srcset="remote 2x"><a href="/Uncaptured">More</a>')
        result = ''.join(parser.output)
        self.assertIn('href="Mario.html#Sunshine"', result)
        self.assertIn('src="../media/image.png"', result)
        self.assertNotIn('srcset', result)
        self.assertIn('href="https://example.org/Uncaptured"', result)


if __name__ == '__main__':
    unittest.main()
