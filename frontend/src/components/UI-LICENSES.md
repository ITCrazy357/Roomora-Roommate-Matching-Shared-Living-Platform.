# Uiverse UI adaptations

Roomora adapts these HTML/CSS examples to React, its semantic theme tokens,
native form controls, keyboard focus and reduced motion. The original sources
were read from the official `uiverse-io/galaxy` repository on 2026-10-13.

| Pattern | Original source | Roomora integration |
| --- | --- | --- |
| Directional button | [cssbuttons-io / massive-mayfly-74](https://uiverse.io/cssbuttons-io/massive-mayfly-74) | `ButtonLink` with `arrow` on the home CTA; shortened arrow feedback |
| Diagonal checkbox fill | [Nawsome / heavy-cheetah-95](https://uiverse.io/Nawsome/heavy-cheetah-95) | `Checkbox` in amenity filters and the listing editor; native focusable input and visible tick |
| Search icon and focus | [satyamchaudharydev / tasty-dingo-5](https://uiverse.io/satyamchaudharydev/tasty-dingo-5) | Shared `Input type="search"` in listing search; native search clearing |
| Sliding switch | [Subaashbala / quiet-ape-66](https://uiverse.io/Subaashbala/quiet-ape-66) | `Switch` in account privacy settings; retains the existing save action |
| Day/night switch | [JkHuger / itchy-turtle-45](https://uiverse.io/JkHuger/itchy-turtle-45) | Compact header theme toggle; coral thumb, sun/moon icons, no glow |
| Arc loader | [barisdogansutcu / light-rat-32](https://uiverse.io/barisdogansutcu/light-rat-32) | `LoadingState` throughout Roomora; static arc with reduced motion |

Implementation: `../app/uiverse.css`, `ui.tsx`, `theme-toggle.tsx`.
Archive: https://github.com/uiverse-io/galaxy

## MIT License

Copyright - 2026 cssbuttons-io (cssbuttons.io)

Copyright - 2026 Nawsome

Copyright - 2026 satyamchaudharydev (satyam)

Copyright - 2026 Subaashbala (Subaash)

Copyright - 2026 JkHuger (JkHuger)

Copyright - 2026 barisdogansutcu (Barış Doğan Sütçü)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
