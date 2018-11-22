# Tensorboard Runs Selection Helper

A TamperMonkey userscript helping you organize Tensorboard runs

## Introduction

Selecting runs in tensorboard one by one is totally a disaster when you have too many runs listed. In most cases, you only want
to toggle each experiment as a whole.

**Only Tensorboard 1.9.0 and 1.12.0 are tested**

&nbsp; &nbsp; &nbsp; **Before** &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; **After**

<img src="/images/before.png?raw=true&111" height="500px">&nbsp;&nbsp;&nbsp;<img src="/images/after.png?raw=true&111" height="500px">

## Usage

1. Import `tbhelper.user.js` to TamperMonkey

2. Set your own URL of Tensorboard on the line 6
```
// @match        http://localhost:8889/*
```

3. Set your own name depth of parent runs `PARENT_RUN_DEPTH`

  e.g. with runs:

    - Jul28_16-23-43
    - Jul28_16-23-43/loss/train
    - Jul28_16-23-43/loss/val
    - Jul28_16-23-43/prec/train
    - Jul28_16-23-43/prec/val
    - Jul29_21-11-37
    - Jul29_21-11-37/loss/train
    - Jul29_21-11-37/loss/val
    - Jul29_21-11-37/prec/train
    - Jul29_21-11-37/prec/val

  If you would like to select runs by its date and time, say `Jul28_16-23-43`,
  just set `PARENT_RUN_DEPTH` to `1`. Runs with name having exactly `PARENT_RUN_DEPTH`
  components (delimited by `/`) are used as *representative selectors* (or called *parent runs*). Runs with name
  starting with a *representative selector* is called *child runs* and hidden from the run list.

  NOTE: the *representative selector* as a invidual run must exists in the original run list,
  e.g. we cannot use `Jul28_16-23-43/loss` as a *representative selector* because it does not exist.

  Suppose another run list:

    - exp1/Jul28_16-23-43
    - exp1/Jul28_16-23-43/loss/train
    - exp1/Jul28_16-23-43/loss/val
    - exp1/Jul28_16-23-43/prec/train
    - exp1/Jul28_16-23-43/prec/val
    - exp1/Jul28_17-48-27
    - exp1/Jul28_17-48-27/loss/train
    - exp1/Jul28_17-48-27/loss/val
    - exp1/Jul28_17-48-27/prec/train
    - exp1/Jul28_17-48-27/prec/val
    - exp2/Jul29_21-11-37
    - exp2/Jul29_21-11-37/loss/train
    - exp2/Jul29_21-11-37/loss/val
    - exp2/Jul29_21-11-37/prec/train
    - exp2/Jul29_21-11-37/prec/val

  In this case `PARENT_RUN_DEPTH` should be set to `2`

4. Open Tensorboard -> Scalars
5. Turn on **Only show parent runs**
6. Toggle individual runs. All scalars in each experiment should be toggled as a whole

