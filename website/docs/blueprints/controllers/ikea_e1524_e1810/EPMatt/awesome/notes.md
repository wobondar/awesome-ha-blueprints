### Center button long press

Please note that the long press on the center button behaves differently from the long press for other buttons, due to how the controller implements this feature: when long pressing the center button, the controller first fires the short press event, then after a couple of seconds it sends the long press event as well. This behaviour is due to the controller design and it's not relative to any integration or the blueprint itself.

### Issues with the E1810 model firing bad events

It has been reported that the newer IKEA E1810 controller, which looks identical to the E1524, might fire wrong events in certain situations when interacting with it. This is due to an issue with the controller design and is not relative to the blueprint itself.

If you notice your controller is not behaving as expected please remove the battery, wait about 2 minutes, insert it back and try again.
