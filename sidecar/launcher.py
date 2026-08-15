"""PyInstaller 入口薄包装：将包目录加入 sys.path 后调用 main。"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from obd_sidecar.main import main  # noqa: E402

if __name__ == "__main__":
    sys.exit(main())
