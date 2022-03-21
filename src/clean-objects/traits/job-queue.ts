// Job Queue
//
// This is related to the host, but is a generic model for holding jobs. It also hoists up jobs to the
// top level world item, similar to the world subscriber.
//
// The purpose of this is to allow any object to create and use the output of a job - which is likely to be
// asynchronous - and also for the top level to limit running those events.
//
// Requirements
// ===============================================================
// - Jobs should be cancellable
// - Jobs should have a priority
// - Jobs should have a timeout
// - Jobs should have an error handler
// - The top level should be able to control the following
//    - Concurrency
//    - Global timeout for a job
