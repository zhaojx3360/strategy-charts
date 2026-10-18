"""Exercise the actual local caption/render/mux workflow on disposable media."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location('finish_video', Path(__file__).parents[1] / 'scripts' / 'finish_video.py')
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class FinishVideoTest(unittest.TestCase):
    def test_render_preserves_audio_and_cleans_only_its_picture_cache(self):
        with tempfile.TemporaryDirectory(prefix='review-finish-test-') as directory:
            root = Path(directory)
            source = root / 'source.mp4'
            still = root / 'still.png'
            subprocess.run([
                'ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=360x640:rate=30',
                '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '5',
                '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
                '-c:a', 'aac', '-b:a', '96k', str(source)
            ], check=True)
            subprocess.run(['ffmpeg', '-v', 'error', '-ss', '2', '-i', str(source),
                            '-frames:v', '1', str(still)], check=True)
            plan = {
                'outputName': 'finished.mp4', 'audioFile': str(source), 'fps': 30, 'size': [360, 640],
                'inputs': [{'filePath': str(p), 'sha256': MODULE.sha256(p)} for p in [source, still]],
                'segments': [
                    {'kind': 'copy', 'filePath': str(source), 'start': 0, 'duration': 2},
                    {'kind': 'still', 'filePath': str(still), 'duration': 1},
                    {'kind': 'copy', 'filePath': str(source), 'start': 3, 'duration': 2}
                ],
                'captions': [
                    {'start': .2, 'end': 1.8, 'lines': ['\u5b57\u5e55\u6d4b\u8bd5'],
                     'emphasis': '\u5b57\u5e55', 'style': 'quote', 'color': 'blue', 'animate': True},
                    {'start': 2, 'end': 3, 'lines': ['\u4fdd\u7559\u539f\u58f0'],
                     'emphasis': '\u539f\u58f0', 'color': 'yellow'}
                ],
                'overlays': [{'start': 3.2, 'end': 4.8, 'lines': ['\u6d4b\u8bd5\u8bf4\u660e']}],
                'pushIns': [{'start': .4, 'end': 1.4, 'amount': .026}]
            }
            manifest = root / 'manifest.json'
            manifest.write_text(json.dumps(plan), encoding='utf-8')
            result = MODULE.finish(manifest, threads=2)
            self.assertEqual(result['frameCount'], 150)
            self.assertTrue(result['audioStreamUnchanged'])
            self.assertTrue(result['fullDecodePassed'])
            self.assertTrue(result['temporaryPictureRemoved'])
            self.assertEqual(MODULE.audio_hash(source), MODULE.audio_hash(root / 'finished.mp4'))
            self.assertFalse((root / '.cache' / 'finish-finished' / 'picture.mp4').exists())
            self.assertIn('\u5b57\u5e55', (root / 'finish-captions.ass').read_text(encoding='utf-8-sig'))
            self.assertTrue((root / 'finish-captions.srt').is_file())
            with self.assertRaisesRegex(AssertionError, 'Never overwrite'):
                MODULE.finish(manifest, threads=2)
            plan['outputName'] = 'invalid.mp4'
            plan['captions'][0]['lines'] = ['a', 'b', 'c']
            manifest.write_text(json.dumps(plan), encoding='utf-8')
            with self.assertRaises(AssertionError):
                MODULE.finish(manifest, threads=2)
            self.assertFalse((root / 'invalid.mp4').exists())


if __name__ == '__main__':
    unittest.main()
