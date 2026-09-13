// Keep Passenger's default entry synchronously loadable by require().
// For hosts that cannot require ES modules, select app.cjs as the startup file.
import "./app.cjs";
