# Vietnam administrative catalog

Roomora vendors code/name pairs from [Vietnamese Provinces Database](https://github.com/thanglequoc/vietnamese-provinces-database), MIT, copyright 2021 Thang Le Quoc.

- Dataset v5.2.0, generated 2026-09-20, latest decree 388/NQ-UBTVQH16.
- Pinned commit: `8b78ba5118715e1fa81769286724db79346abf52`.
- Source file: `json/vn_only_simplified_json_generated_data_vn_units.json`.
- 34 province-level units; 3,321 wards/communes/special zones. No district level.
- Official source used by upstream: https://danhmuchanhchinh.nso.gov.vn/.
- Base official code list: Decision 19/2025/QD-TTg, effective 2025-07-01.

Updates: regenerate the code/name subset from a reviewed, pinned upstream release, check counts and cross-province uniqueness, run catalog and profile tests, then deploy the API. Never silently replace users' location codes. Preserve this notice and license with the dataset.

## MIT License

Copyright (c) 2021 Thang Le Quoc

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
