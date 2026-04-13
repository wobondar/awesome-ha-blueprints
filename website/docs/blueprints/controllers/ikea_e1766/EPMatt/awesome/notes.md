### Hooks support and missing long press events

Due to the controller not exposing long press events but only short and release events, it's not possible to determine the nature of a button press. Therefore, to prevent an erroneous behaviour, Hooks only rely on short and virtual double press events to implement their functionality for this controller.
