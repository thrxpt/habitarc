# Habit and Activity Tracking

Habitarc helps students build consistent study and movement routines and understand their personal progress.

## Language

**Participant**: A student who tracks personal routines and progress. Their tracking history is private. _Avoid_: Patient, customer

**Program Manager**: A person who maintains the activity templates available to participants. This role does not grant access to participants' private tracking histories. _Avoid_: Coach, administrator

**Activity Template**: A shared definition of an activity that participants can choose to track, including its measurement unit and valid range. _Avoid_: Habit, personal goal

**Habit**: A participant's recurring personal commitment, based on one Activity Template and personalized with a target and schedule. _Avoid_: Activity Template, Activity Entry

**Activity Entry**: A record of a positive whole-number amount of activity performed toward exactly one Habit. _Avoid_: Habit, goal

**Measurement Unit**: The fixed unit used to express an Activity Template's amounts: minutes or counts. _Avoid_: Score, points

**Schedule**: The weekdays on which a Habit has a daily target, including every day when all seven weekdays are selected. _Avoid_: Weekly quota

**Daily Target**: The amount a participant aims to reach for a Habit on each scheduled day, expressed in its Measurement Unit. _Avoid_: Weekly goal, score

**Daily Total**: The sum of the amounts recorded in a Habit's Activity Entries for one calendar date. _Avoid_: Activity Entry, Daily Target

**Account Timezone**: The fixed timezone that defines a participant's calendar dates for tracking, regardless of their device's timezone. _Avoid_: Device timezone

**Reminder**: A participant-selected time for an in-app indicator that a scheduled Habit's daily target remains unmet. _Avoid_: Push notification, alarm

**Goal Revision**: A Daily Target and Schedule that apply to a Habit from a particular date until superseded. _Avoid_: Retroactive goal edit

**Completed Day**: A scheduled date on which a Habit's Daily Total meets or exceeds the Daily Target applicable to that date. _Avoid_: Entry, check-in

**Missed Day**: A scheduled date that has ended without the Habit reaching its applicable Daily Target. _Avoid_: Rest day, unscheduled day

**Unscheduled Day**: A date on which a Habit has no target obligation; recorded activity still contributes to its activity totals. _Avoid_: Missed Day

**Streak**: A run of consecutive scheduled dates on which a Habit meets its Daily Target; intervening Unscheduled Days neither extend nor break the run. _Avoid_: Consecutive calendar days

**Archived Habit**: A Habit whose tracking period has ended while its history remains available. _Avoid_: Deleted Habit, paused Habit

**Completion Rate**: The proportion of a Habit's scheduled dates in a reporting period that are Completed Days. _Avoid_: Percentage of target, activity volume
