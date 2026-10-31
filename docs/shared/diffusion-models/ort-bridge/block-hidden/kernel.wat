(module
  (type (;0;) (func (param f64) (result f64)))
  (type (;1;) (func (param f64 f64) (result f64)))
  (type (;2;) (func (param f32) (result i32)))
  (type (;3;) (func (param i32 i32) (result i32)))
  (type (;4;) (func (param f32 i32 i32) (result i32)))
  (type (;5;) (func (param i32 i32 i32 i32) (result i32)))
  (type (;6;) (func (param i32 i32 i32 i32 i32) (result i32)))
  (type (;7;) (func (param i32 i32 i32 i32 i32 i32) (result i32)))
  (import "env" "cos" (func (;0;) (type 0)))
  (import "env" "sin" (func (;1;) (type 0)))
  (import "env" "pow" (func (;2;) (type 1)))
  (import "env" "sqrt" (func (;3;) (type 0)))
  (func (;4;) (type 2) (param f32) (result i32)
    (local i32 i32 f32 f32 i32 f32 f32 f32 f32 i32 i32 i32 i32)
    global.get 0
    local.set 13
    block  ;; label = @1
      loop  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        local.get 12
                        br_table 0 (;@10;) 1 (;@9;) 2 (;@8;) 3 (;@7;) 4 (;@6;) 5 (;@5;) 6 (;@4;) 7 (;@3;) 9 (;@1;)
                      end
                      global.get 0
                      local.set 1
                      global.get 0
                      i32.const 4
                      i32.add
                      global.set 0
                      local.get 1
                      local.get 0
                      f32.store
                      global.get 0
                      local.set 2
                      global.get 0
                      i32.const 1
                      i32.add
                      global.set 0
                      local.get 2
                      i32.const 0
                      i32.store8
                      local.get 1
                      f32.load
                      local.set 3
                      local.get 1
                      f32.load
                      local.set 4
                      local.get 3
                      local.get 4
                      f32.eq
                      local.set 5
                      local.get 5
                      if  ;; label = @10
                        i32.const 3
                        local.set 12
                        br 8 (;@2;)
                      else
                        i32.const 4
                        local.set 12
                        br 8 (;@2;)
                      end
                    end
                    local.get 13
                    global.set 0
                    i32.const 0
                    return
                  end
                  i32.const 7
                  local.set 12
                  br 5 (;@2;)
                end
                local.get 1
                f32.load
                local.set 6
                local.get 1
                f32.load
                local.set 7
                local.get 6
                local.get 7
                f32.sub
                local.set 8
                i32.const 0
                f32.convert_i32_s
                local.set 9
                local.get 8
                local.get 9
                f32.eq
                local.set 10
                local.get 2
                local.get 10
                i32.store8
                i32.const 5
                local.set 12
                br 4 (;@2;)
              end
              i32.const 5
              local.set 12
              br 3 (;@2;)
            end
            local.get 2
            i32.load8_u
            local.set 11
            local.get 13
            global.set 0
            local.get 11
            return
          end
          i32.const 2
          local.set 12
          br 1 (;@2;)
        end
        i32.const 1
        local.set 12
        br 0 (;@2;)
      end
    end
    unreachable)
  (func (;5;) (type 3) (param i32 i32) (result i32)
    (local i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 i32 i32 i32 i32 i32 i32)
    global.get 0
    local.set 17
    block  ;; label = @1
      loop  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        block  ;; label = @11
                          block  ;; label = @12
                            block  ;; label = @13
                              block  ;; label = @14
                                block  ;; label = @15
                                  block  ;; label = @16
                                    block  ;; label = @17
                                      block  ;; label = @18
                                        block  ;; label = @19
                                          block  ;; label = @20
                                            block  ;; label = @21
                                              block  ;; label = @22
                                                block  ;; label = @23
                                                  block  ;; label = @24
                                                    local.get 16
                                                    br_table 0 (;@24;) 1 (;@23;) 2 (;@22;) 3 (;@21;) 4 (;@20;) 5 (;@19;) 6 (;@18;) 7 (;@17;) 8 (;@16;) 9 (;@15;) 10 (;@14;) 11 (;@13;) 12 (;@12;) 13 (;@11;) 14 (;@10;) 15 (;@9;) 16 (;@8;) 17 (;@7;) 18 (;@6;) 19 (;@5;) 20 (;@4;) 21 (;@3;) 23 (;@1;)
                                                  end
                                                  global.get 0
                                                  local.set 2
                                                  global.get 0
                                                  i32.const 4
                                                  i32.add
                                                  global.set 0
                                                  local.get 2
                                                  local.get 0
                                                  i32.store
                                                  global.get 0
                                                  local.set 3
                                                  global.get 0
                                                  i32.const 4
                                                  i32.add
                                                  global.set 0
                                                  local.get 3
                                                  local.get 1
                                                  i32.store
                                                  global.get 0
                                                  local.set 4
                                                  global.get 0
                                                  i32.const 4
                                                  i32.add
                                                  global.set 0
                                                  local.get 4
                                                  i32.const 0
                                                  i32.store
                                                  i32.const 4
                                                  local.set 16
                                                  br 21 (;@2;)
                                                end
                                                local.get 17
                                                global.set 0
                                                i32.const 0
                                                return
                                              end
                                              local.get 17
                                              global.set 0
                                              i32.const 1
                                              return
                                            end
                                            i32.const 2
                                            local.set 16
                                            br 18 (;@2;)
                                          end
                                          local.get 4
                                          i32.load
                                          local.set 5
                                          local.get 3
                                          i32.load
                                          local.set 6
                                          local.get 5
                                          local.get 6
                                          i32.lt_s
                                          local.set 7
                                          local.get 7
                                          if  ;; label = @20
                                            i32.const 8
                                            local.set 16
                                            br 18 (;@2;)
                                          else
                                            i32.const 9
                                            local.set 16
                                            br 18 (;@2;)
                                          end
                                        end
                                        i32.const 3
                                        local.set 16
                                        br 16 (;@2;)
                                      end
                                      i32.const 4
                                      local.set 16
                                      br 15 (;@2;)
                                    end
                                    i32.const 6
                                    local.set 16
                                    br 14 (;@2;)
                                  end
                                  local.get 2
                                  i32.load
                                  local.set 8
                                  local.get 4
                                  i32.load
                                  local.set 9
                                  local.get 8
                                  local.get 9
                                  i32.const 4
                                  i32.mul
                                  i32.add
                                  local.set 10
                                  local.get 10
                                  f32.load
                                  local.set 11
                                  local.get 11
                                  call 4
                                  local.set 12
                                  local.get 12
                                  i32.eqz
                                  local.set 13
                                  local.get 13
                                  if  ;; label = @16
                                    i32.const 12
                                    local.set 16
                                    br 14 (;@2;)
                                  else
                                    i32.const 13
                                    local.set 16
                                    br 14 (;@2;)
                                  end
                                end
                                i32.const 3
                                local.set 16
                                br 12 (;@2;)
                              end
                              i32.const 7
                              local.set 16
                              br 11 (;@2;)
                            end
                            local.get 4
                            i32.load
                            local.set 14
                            local.get 14
                            i32.const 1
                            i32.add
                            local.set 15
                            local.get 4
                            local.get 15
                            i32.store
                            i32.const 16
                            local.set 16
                            br 10 (;@2;)
                          end
                          local.get 17
                          global.set 0
                          i32.const 0
                          return
                        end
                        i32.const 14
                        local.set 16
                        br 8 (;@2;)
                      end
                      i32.const 11
                      local.set 16
                      br 7 (;@2;)
                    end
                    i32.const 14
                    local.set 16
                    br 6 (;@2;)
                  end
                  i32.const 10
                  local.set 16
                  br 5 (;@2;)
                end
                i32.const 10
                local.set 16
                br 4 (;@2;)
              end
              i32.const 4
              local.set 16
              br 3 (;@2;)
            end
            i32.const 21
            local.set 16
            br 2 (;@2;)
          end
          i32.const 19
          local.set 16
          br 1 (;@2;)
        end
        i32.const 1
        local.set 16
        br 0 (;@2;)
      end
    end
    unreachable)
  (func (;6;) (type 4) (param f32 i32 i32) (result i32)
    (local i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 i32 i32 i32 f32 f32 i32 i32 f32 f32 i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 f32 f32 f32 i32 f64 f32 f64 f64 f32 i32 f32 f32 f32 i32 f32 f64 f64 f32 i32 i32 i32 i32 i32 f32 f64 f64 f32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
    global.get 0
    local.set 69
    block  ;; label = @1
      loop  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        block  ;; label = @11
                          block  ;; label = @12
                            block  ;; label = @13
                              block  ;; label = @14
                                block  ;; label = @15
                                  block  ;; label = @16
                                    block  ;; label = @17
                                      block  ;; label = @18
                                        block  ;; label = @19
                                          block  ;; label = @20
                                            block  ;; label = @21
                                              block  ;; label = @22
                                                block  ;; label = @23
                                                  block  ;; label = @24
                                                    block  ;; label = @25
                                                      block  ;; label = @26
                                                        block  ;; label = @27
                                                          block  ;; label = @28
                                                            block  ;; label = @29
                                                              block  ;; label = @30
                                                                block  ;; label = @31
                                                                  block  ;; label = @32
                                                                    block  ;; label = @33
                                                                      block  ;; label = @34
                                                                        block  ;; label = @35
                                                                          block  ;; label = @36
                                                                            block  ;; label = @37
                                                                              local.get 68
                                                                              br_table 0 (;@37;) 1 (;@36;) 2 (;@35;) 3 (;@34;) 4 (;@33;) 5 (;@32;) 6 (;@31;) 7 (;@30;) 8 (;@29;) 9 (;@28;) 10 (;@27;) 11 (;@26;) 12 (;@25;) 13 (;@24;) 14 (;@23;) 15 (;@22;) 16 (;@21;) 17 (;@20;) 18 (;@19;) 19 (;@18;) 20 (;@17;) 21 (;@16;) 22 (;@15;) 23 (;@14;) 24 (;@13;) 25 (;@12;) 26 (;@11;) 27 (;@10;) 28 (;@9;) 29 (;@8;) 30 (;@7;) 31 (;@6;) 32 (;@5;) 33 (;@4;) 34 (;@3;) 36 (;@1;)
                                                                            end
                                                                            global.get 0
                                                                            local.set 3
                                                                            global.get 0
                                                                            i32.const 4
                                                                            i32.add
                                                                            global.set 0
                                                                            local.get 3
                                                                            local.get 0
                                                                            f32.store
                                                                            global.get 0
                                                                            local.set 4
                                                                            global.get 0
                                                                            i32.const 4
                                                                            i32.add
                                                                            global.set 0
                                                                            local.get 4
                                                                            local.get 1
                                                                            i32.store
                                                                            global.get 0
                                                                            local.set 5
                                                                            global.get 0
                                                                            i32.const 4
                                                                            i32.add
                                                                            global.set 0
                                                                            local.get 5
                                                                            local.get 2
                                                                            i32.store
                                                                            global.get 0
                                                                            local.set 6
                                                                            global.get 0
                                                                            i32.const 1
                                                                            i32.add
                                                                            global.set 0
                                                                            local.get 6
                                                                            i32.const 1
                                                                            i32.store8
                                                                            global.get 0
                                                                            local.set 7
                                                                            global.get 0
                                                                            i32.const 1
                                                                            i32.add
                                                                            global.set 0
                                                                            local.get 7
                                                                            i32.const 1
                                                                            i32.store8
                                                                            global.get 0
                                                                            local.set 8
                                                                            global.get 0
                                                                            i32.const 1
                                                                            i32.add
                                                                            global.set 0
                                                                            local.get 8
                                                                            i32.const 1
                                                                            i32.store8
                                                                            local.get 5
                                                                            i32.load
                                                                            local.set 9
                                                                            local.get 9
                                                                            i32.const 256
                                                                            i32.ne
                                                                            local.set 10
                                                                            local.get 10
                                                                            if  ;; label = @37
                                                                              i32.const 3
                                                                              local.set 68
                                                                              br 35 (;@2;)
                                                                            else
                                                                              i32.const 4
                                                                              local.set 68
                                                                              br 35 (;@2;)
                                                                            end
                                                                          end
                                                                          local.get 69
                                                                          global.set 0
                                                                          i32.const 0
                                                                          return
                                                                        end
                                                                        global.get 0
                                                                        local.set 11
                                                                        global.get 0
                                                                        i32.const 4
                                                                        i32.add
                                                                        global.set 0
                                                                        local.get 11
                                                                        i32.const 0
                                                                        i32.store
                                                                        i32.const 18
                                                                        local.set 68
                                                                        br 32 (;@2;)
                                                                      end
                                                                      i32.const 5
                                                                      local.set 68
                                                                      br 31 (;@2;)
                                                                    end
                                                                    local.get 3
                                                                    f32.load
                                                                    local.set 12
                                                                    local.get 12
                                                                    call 4
                                                                    local.set 13
                                                                    local.get 13
                                                                    i32.eqz
                                                                    local.set 14
                                                                    local.get 8
                                                                    local.get 14
                                                                    i32.store8
                                                                    i32.const 5
                                                                    local.set 68
                                                                    br 30 (;@2;)
                                                                  end
                                                                  local.get 8
                                                                  i32.load8_u
                                                                  local.set 15
                                                                  local.get 15
                                                                  if  ;; label = @32
                                                                    i32.const 6
                                                                    local.set 68
                                                                    br 30 (;@2;)
                                                                  else
                                                                    i32.const 7
                                                                    local.set 68
                                                                    br 30 (;@2;)
                                                                  end
                                                                end
                                                                i32.const 8
                                                                local.set 68
                                                                br 28 (;@2;)
                                                              end
                                                              local.get 3
                                                              f32.load
                                                              local.set 16
                                                              i32.const 0
                                                              f32.convert_i32_s
                                                              local.set 17
                                                              local.get 16
                                                              local.get 17
                                                              f32.lt
                                                              local.set 18
                                                              local.get 7
                                                              local.get 18
                                                              i32.store8
                                                              i32.const 8
                                                              local.set 68
                                                              br 27 (;@2;)
                                                            end
                                                            local.get 7
                                                            i32.load8_u
                                                            local.set 19
                                                            local.get 19
                                                            if  ;; label = @29
                                                              i32.const 9
                                                              local.set 68
                                                              br 27 (;@2;)
                                                            else
                                                              i32.const 10
                                                              local.set 68
                                                              br 27 (;@2;)
                                                            end
                                                          end
                                                          i32.const 11
                                                          local.set 68
                                                          br 25 (;@2;)
                                                        end
                                                        local.get 3
                                                        f32.load
                                                        local.set 20
                                                        i32.const 1000
                                                        f32.convert_i32_s
                                                        local.set 21
                                                        local.get 20
                                                        local.get 21
                                                        f32.gt
                                                        local.set 22
                                                        local.get 6
                                                        local.get 22
                                                        i32.store8
                                                        i32.const 11
                                                        local.set 68
                                                        br 24 (;@2;)
                                                      end
                                                      local.get 6
                                                      i32.load8_u
                                                      local.set 23
                                                      local.get 23
                                                      if  ;; label = @26
                                                        i32.const 12
                                                        local.set 68
                                                        br 24 (;@2;)
                                                      else
                                                        i32.const 13
                                                        local.set 68
                                                        br 24 (;@2;)
                                                      end
                                                    end
                                                    i32.const 0
                                                    i32.const 1
                                                    i32.sub
                                                    local.set 24
                                                    local.get 69
                                                    global.set 0
                                                    local.get 24
                                                    return
                                                  end
                                                  i32.const 14
                                                  local.set 68
                                                  br 21 (;@2;)
                                                end
                                                i32.const 2
                                                local.set 68
                                                br 20 (;@2;)
                                              end
                                              i32.const 14
                                              local.set 68
                                              br 19 (;@2;)
                                            end
                                            local.get 4
                                            i32.load
                                            local.set 25
                                            local.get 25
                                            i32.const 256
                                            call 5
                                            local.set 26
                                            local.get 26
                                            i32.eqz
                                            local.set 27
                                            local.get 27
                                            if  ;; label = @21
                                              i32.const 28
                                              local.set 68
                                              br 19 (;@2;)
                                            else
                                              i32.const 29
                                              local.set 68
                                              br 19 (;@2;)
                                            end
                                          end
                                          i32.const 16
                                          local.set 68
                                          br 17 (;@2;)
                                        end
                                        local.get 11
                                        i32.load
                                        local.set 28
                                        local.get 28
                                        i32.const 128
                                        i32.lt_s
                                        local.set 29
                                        local.get 29
                                        if  ;; label = @19
                                          i32.const 22
                                          local.set 68
                                          br 17 (;@2;)
                                        else
                                          i32.const 23
                                          local.set 68
                                          br 17 (;@2;)
                                        end
                                      end
                                      i32.const 17
                                      local.set 68
                                      br 15 (;@2;)
                                    end
                                    i32.const 18
                                    local.set 68
                                    br 14 (;@2;)
                                  end
                                  i32.const 20
                                  local.set 68
                                  br 13 (;@2;)
                                end
                                local.get 11
                                i32.load
                                local.set 30
                                local.get 30
                                f32.convert_i32_s
                                local.set 31
                                f32.const 0x0p+0 (;=0;)
                                local.get 31
                                f32.sub
                                local.set 32
                                i32.const 128
                                f32.convert_i32_s
                                local.set 33
                                local.get 32
                                local.get 33
                                f32.div
                                local.set 34
                                global.get 0
                                local.set 35
                                global.get 0
                                i32.const 4
                                i32.add
                                global.set 0
                                local.get 35
                                local.get 34
                                f32.store
                                i32.const 10000
                                f64.convert_i32_s
                                local.set 36
                                local.get 35
                                f32.load
                                local.set 37
                                local.get 37
                                f64.promote_f32
                                local.set 38
                                local.get 36
                                local.get 38
                                call 2
                                local.set 39
                                local.get 39
                                f32.demote_f64
                                local.set 40
                                global.get 0
                                local.set 41
                                global.get 0
                                i32.const 4
                                i32.add
                                global.set 0
                                local.get 41
                                local.get 40
                                f32.store
                                local.get 3
                                f32.load
                                local.set 42
                                local.get 41
                                f32.load
                                local.set 43
                                local.get 42
                                local.get 43
                                f32.mul
                                local.set 44
                                global.get 0
                                local.set 45
                                global.get 0
                                i32.const 4
                                i32.add
                                global.set 0
                                local.get 45
                                local.get 44
                                f32.store
                                local.get 45
                                f32.load
                                local.set 46
                                local.get 46
                                f64.promote_f32
                                local.set 47
                                local.get 47
                                call 0
                                local.set 48
                                local.get 48
                                f32.demote_f64
                                local.set 49
                                local.get 4
                                i32.load
                                local.set 50
                                local.get 4
                                i32.load
                                local.set 51
                                local.get 11
                                i32.load
                                local.set 52
                                local.get 4
                                i32.load
                                local.set 53
                                local.get 53
                                local.get 52
                                i32.const 4
                                i32.mul
                                i32.add
                                local.set 54
                                local.get 54
                                local.get 49
                                f32.store
                                local.get 45
                                f32.load
                                local.set 55
                                local.get 55
                                f64.promote_f32
                                local.set 56
                                local.get 56
                                call 1
                                local.set 57
                                local.get 57
                                f32.demote_f64
                                local.set 58
                                local.get 4
                                i32.load
                                local.set 59
                                local.get 4
                                i32.load
                                local.set 60
                                local.get 11
                                i32.load
                                local.set 61
                                local.get 61
                                i32.const 128
                                i32.add
                                local.set 62
                                local.get 4
                                i32.load
                                local.set 63
                                local.get 63
                                local.get 62
                                i32.const 4
                                i32.mul
                                i32.add
                                local.set 64
                                local.get 64
                                local.get 58
                                f32.store
                                local.get 11
                                i32.load
                                local.set 65
                                local.get 65
                                i32.const 1
                                i32.add
                                local.set 66
                                local.get 11
                                local.get 66
                                i32.store
                                i32.const 24
                                local.set 68
                                br 12 (;@2;)
                              end
                              i32.const 17
                              local.set 68
                              br 11 (;@2;)
                            end
                            i32.const 21
                            local.set 68
                            br 10 (;@2;)
                          end
                          i32.const 24
                          local.set 68
                          br 9 (;@2;)
                        end
                        i32.const 18
                        local.set 68
                        br 8 (;@2;)
                      end
                      local.get 69
                      global.set 0
                      i32.const 0
                      return
                    end
                    i32.const 0
                    i32.const 3
                    i32.sub
                    local.set 67
                    local.get 69
                    global.set 0
                    local.get 67
                    return
                  end
                  i32.const 30
                  local.set 68
                  br 5 (;@2;)
                end
                i32.const 27
                local.set 68
                br 4 (;@2;)
              end
              i32.const 30
              local.set 68
              br 3 (;@2;)
            end
            i32.const 34
            local.set 68
            br 2 (;@2;)
          end
          i32.const 32
          local.set 68
          br 1 (;@2;)
        end
        i32.const 1
        local.set 68
        br 0 (;@2;)
      end
    end
    unreachable)
  (func (;7;) (type 4) (param f32 i32 i32) (result i32)
    (local i32 i32 i32)
    global.get 0
    local.set 5
    block  ;; label = @1
      loop  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  local.get 4
                  br_table 0 (;@7;) 1 (;@6;) 2 (;@5;) 3 (;@4;) 4 (;@3;) 6 (;@1;)
                end
                local.get 0
                local.get 1
                local.get 2
                call 6
                local.set 3
                local.get 5
                global.set 0
                local.get 3
                return
              end
              local.get 5
              global.set 0
              i32.const 0
              return
            end
            i32.const 4
            local.set 4
            br 2 (;@2;)
          end
          i32.const 2
          local.set 4
          br 1 (;@2;)
        end
        i32.const 1
        local.set 4
        br 0 (;@2;)
      end
    end
    unreachable)
  (func (;8;) (type 5) (param i32 i32 i32 i32) (result i32)
    (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 f32 i32 i32 i32 i32 i32 i32 f32 f32 f32 i32 i32 i32 i32 i32 i32 i32 i32 f32 i32 f32 f32 f32 i32 f32 i32 i32 i32 f32 i32 i32 i32 i32 i32 i32 f32 f32 i32 i32 f32 f32 f32 f32 f32 f32 f64 f64 f32 i32 f32 f32 f32 i32 i32 i32 f32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 f32 f32 i32 f32 f32 f32 f32 f32 i32 i32 f32 i32 i32 i32 f32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 f32 f32 f32 f32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
    global.get 0
    local.set 141
    block  ;; label = @1
      loop  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        block  ;; label = @11
                          block  ;; label = @12
                            block  ;; label = @13
                              block  ;; label = @14
                                block  ;; label = @15
                                  block  ;; label = @16
                                    block  ;; label = @17
                                      block  ;; label = @18
                                        block  ;; label = @19
                                          block  ;; label = @20
                                            block  ;; label = @21
                                              block  ;; label = @22
                                                block  ;; label = @23
                                                  block  ;; label = @24
                                                    block  ;; label = @25
                                                      block  ;; label = @26
                                                        block  ;; label = @27
                                                          block  ;; label = @28
                                                            block  ;; label = @29
                                                              block  ;; label = @30
                                                                block  ;; label = @31
                                                                  block  ;; label = @32
                                                                    block  ;; label = @33
                                                                      block  ;; label = @34
                                                                        block  ;; label = @35
                                                                          block  ;; label = @36
                                                                            block  ;; label = @37
                                                                              block  ;; label = @38
                                                                                block  ;; label = @39
                                                                                  block  ;; label = @40
                                                                                    block  ;; label = @41
                                                                                      block  ;; label = @42
                                                                                        block  ;; label = @43
                                                                                          block  ;; label = @44
                                                                                            block  ;; label = @45
                                                                                              block  ;; label = @46
                                                                                                block  ;; label = @47
                                                                                                  block  ;; label = @48
                                                                                                    block  ;; label = @49
                                                                                                      block  ;; label = @50
                                                                                                        block  ;; label = @51
                                                                                                          block  ;; label = @52
                                                                                                            block  ;; label = @53
                                                                                                              block  ;; label = @54
                                                                                                                block  ;; label = @55
                                                                                                                  block  ;; label = @56
                                                                                                                    block  ;; label = @57
                                                                                                                      block  ;; label = @58
                                                                                                                        block  ;; label = @59
                                                                                                                          block  ;; label = @60
                                                                                                                            block  ;; label = @61
                                                                                                                              block  ;; label = @62
                                                                                                                                block  ;; label = @63
                                                                                                                                  block  ;; label = @64
                                                                                                                                    block  ;; label = @65
                                                                                                                                      block  ;; label = @66
                                                                                                                                        block  ;; label = @67
                                                                                                                                          block  ;; label = @68
                                                                                                                                            block  ;; label = @69
                                                                                                                                              block  ;; label = @70
                                                                                                                                                block  ;; label = @71
                                                                                                                                                  block  ;; label = @72
                                                                                                                                                    block  ;; label = @73
                                                                                                                                                      block  ;; label = @74
                                                                                                                                                        block  ;; label = @75
                                                                                                                                                          block  ;; label = @76
                                                                                                                                                            block  ;; label = @77
                                                                                                                                                              block  ;; label = @78
                                                                                                                                                                block  ;; label = @79
                                                                                                                                                                  block  ;; label = @80
                                                                                                                                                                    block  ;; label = @81
                                                                                                                                                                      block  ;; label = @82
                                                                                                                                                                        block  ;; label = @83
                                                                                                                                                                          block  ;; label = @84
                                                                                                                                                                            block  ;; label = @85
                                                                                                                                                                              block  ;; label = @86
                                                                                                                                                                                block  ;; label = @87
                                                                                                                                                                                  block  ;; label = @88
                                                                                                                                                                                    block  ;; label = @89
                                                                                                                                                                                      block  ;; label = @90
                                                                                                                                                                                        block  ;; label = @91
                                                                                                                                                                                          block  ;; label = @92
                                                                                                                                                                                            block  ;; label = @93
                                                                                                                                                                                              block  ;; label = @94
                                                                                                                                                                                                block  ;; label = @95
                                                                                                                                                                                                  block  ;; label = @96
                                                                                                                                                                                                    block  ;; label = @97
                                                                                                                                                                                                      block  ;; label = @98
                                                                                                                                                                                                        block  ;; label = @99
                                                                                                                                                                                                          block  ;; label = @100
                                                                                                                                                                                                            block  ;; label = @101
                                                                                                                                                                                                              local.get 140
                                                                                                                                                                                                              br_table 0 (;@101;) 1 (;@100;) 2 (;@99;) 3 (;@98;) 4 (;@97;) 5 (;@96;) 6 (;@95;) 7 (;@94;) 8 (;@93;) 9 (;@92;) 10 (;@91;) 11 (;@90;) 12 (;@89;) 13 (;@88;) 14 (;@87;) 15 (;@86;) 16 (;@85;) 17 (;@84;) 18 (;@83;) 19 (;@82;) 20 (;@81;) 21 (;@80;) 22 (;@79;) 23 (;@78;) 24 (;@77;) 25 (;@76;) 26 (;@75;) 27 (;@74;) 28 (;@73;) 29 (;@72;) 30 (;@71;) 31 (;@70;) 32 (;@69;) 33 (;@68;) 34 (;@67;) 35 (;@66;) 36 (;@65;) 37 (;@64;) 38 (;@63;) 39 (;@62;) 40 (;@61;) 41 (;@60;) 42 (;@59;) 43 (;@58;) 44 (;@57;) 45 (;@56;) 46 (;@55;) 47 (;@54;) 48 (;@53;) 49 (;@52;) 50 (;@51;) 51 (;@50;) 52 (;@49;) 53 (;@48;) 54 (;@47;) 55 (;@46;) 56 (;@45;) 57 (;@44;) 58 (;@43;) 59 (;@42;) 60 (;@41;) 61 (;@40;) 62 (;@39;) 63 (;@38;) 64 (;@37;) 65 (;@36;) 66 (;@35;) 67 (;@34;) 68 (;@33;) 69 (;@32;) 70 (;@31;) 71 (;@30;) 72 (;@29;) 73 (;@28;) 74 (;@27;) 75 (;@26;) 76 (;@25;) 77 (;@24;) 78 (;@23;) 79 (;@22;) 80 (;@21;) 81 (;@20;) 82 (;@19;) 83 (;@18;) 84 (;@17;) 85 (;@16;) 86 (;@15;) 87 (;@14;) 88 (;@13;) 89 (;@12;) 90 (;@11;) 91 (;@10;) 92 (;@9;) 93 (;@8;) 94 (;@7;) 95 (;@6;) 96 (;@5;) 97 (;@4;) 98 (;@3;) 100 (;@1;)
                                                                                                                                                                                                            end
                                                                                                                                                                                                            global.get 0
                                                                                                                                                                                                            local.set 4
                                                                                                                                                                                                            global.get 0
                                                                                                                                                                                                            i32.const 4
                                                                                                                                                                                                            i32.add
                                                                                                                                                                                                            global.set 0
                                                                                                                                                                                                            local.get 4
                                                                                                                                                                                                            local.get 0
                                                                                                                                                                                                            i32.store
                                                                                                                                                                                                            global.get 0
                                                                                                                                                                                                            local.set 5
                                                                                                                                                                                                            global.get 0
                                                                                                                                                                                                            i32.const 4
                                                                                                                                                                                                            i32.add
                                                                                                                                                                                                            global.set 0
                                                                                                                                                                                                            local.get 5
                                                                                                                                                                                                            local.get 1
                                                                                                                                                                                                            i32.store
                                                                                                                                                                                                            global.get 0
                                                                                                                                                                                                            local.set 6
                                                                                                                                                                                                            global.get 0
                                                                                                                                                                                                            i32.const 4
                                                                                                                                                                                                            i32.add
                                                                                                                                                                                                            global.set 0
                                                                                                                                                                                                            local.get 6
                                                                                                                                                                                                            local.get 2
                                                                                                                                                                                                            i32.store
                                                                                                                                                                                                            global.get 0
                                                                                                                                                                                                            local.set 7
                                                                                                                                                                                                            global.get 0
                                                                                                                                                                                                            i32.const 4
                                                                                                                                                                                                            i32.add
                                                                                                                                                                                                            global.set 0
                                                                                                                                                                                                            local.get 7
                                                                                                                                                                                                            local.get 3
                                                                                                                                                                                                            i32.store
                                                                                                                                                                                                            global.get 0
                                                                                                                                                                                                            local.set 8
                                                                                                                                                                                                            global.get 0
                                                                                                                                                                                                            i32.const 1
                                                                                                                                                                                                            i32.add
                                                                                                                                                                                                            global.set 0
                                                                                                                                                                                                            local.get 8
                                                                                                                                                                                                            i32.const 1
                                                                                                                                                                                                            i32.store8
                                                                                                                                                                                                            local.get 5
                                                                                                                                                                                                            i32.load
                                                                                                                                                                                                            local.set 9
                                                                                                                                                                                                            local.get 9
                                                                                                                                                                                                            i32.const 2
                                                                                                                                                                                                            i32.ne
                                                                                                                                                                                                            local.set 10
                                                                                                                                                                                                            local.get 10
                                                                                                                                                                                                            if  ;; label = @101
                                                                                                                                                                                                              i32.const 3
                                                                                                                                                                                                              local.set 140
                                                                                                                                                                                                              br 99 (;@2;)
                                                                                                                                                                                                            else
                                                                                                                                                                                                              i32.const 4
                                                                                                                                                                                                              local.set 140
                                                                                                                                                                                                              br 99 (;@2;)
                                                                                                                                                                                                            end
                                                                                                                                                                                                          end
                                                                                                                                                                                                          local.get 141
                                                                                                                                                                                                          global.set 0
                                                                                                                                                                                                          i32.const 0
                                                                                                                                                                                                          return
                                                                                                                                                                                                        end
                                                                                                                                                                                                        local.get 4
                                                                                                                                                                                                        i32.load
                                                                                                                                                                                                        local.set 11
                                                                                                                                                                                                        local.get 11
                                                                                                                                                                                                        i32.const 10240
                                                                                                                                                                                                        call 5
                                                                                                                                                                                                        local.set 12
                                                                                                                                                                                                        local.get 12
                                                                                                                                                                                                        i32.eqz
                                                                                                                                                                                                        local.set 13
                                                                                                                                                                                                        local.get 13
                                                                                                                                                                                                        if  ;; label = @99
                                                                                                                                                                                                          i32.const 11
                                                                                                                                                                                                          local.set 140
                                                                                                                                                                                                          br 97 (;@2;)
                                                                                                                                                                                                        else
                                                                                                                                                                                                          i32.const 12
                                                                                                                                                                                                          local.set 140
                                                                                                                                                                                                          br 97 (;@2;)
                                                                                                                                                                                                        end
                                                                                                                                                                                                      end
                                                                                                                                                                                                      i32.const 5
                                                                                                                                                                                                      local.set 140
                                                                                                                                                                                                      br 95 (;@2;)
                                                                                                                                                                                                    end
                                                                                                                                                                                                    local.get 7
                                                                                                                                                                                                    i32.load
                                                                                                                                                                                                    local.set 14
                                                                                                                                                                                                    local.get 14
                                                                                                                                                                                                    i32.const 10240
                                                                                                                                                                                                    i32.ne
                                                                                                                                                                                                    local.set 15
                                                                                                                                                                                                    local.get 8
                                                                                                                                                                                                    local.get 15
                                                                                                                                                                                                    i32.store8
                                                                                                                                                                                                    i32.const 5
                                                                                                                                                                                                    local.set 140
                                                                                                                                                                                                    br 94 (;@2;)
                                                                                                                                                                                                  end
                                                                                                                                                                                                  local.get 8
                                                                                                                                                                                                  i32.load8_u
                                                                                                                                                                                                  local.set 16
                                                                                                                                                                                                  local.get 16
                                                                                                                                                                                                  if  ;; label = @96
                                                                                                                                                                                                    i32.const 6
                                                                                                                                                                                                    local.set 140
                                                                                                                                                                                                    br 94 (;@2;)
                                                                                                                                                                                                  else
                                                                                                                                                                                                    i32.const 7
                                                                                                                                                                                                    local.set 140
                                                                                                                                                                                                    br 94 (;@2;)
                                                                                                                                                                                                  end
                                                                                                                                                                                                end
                                                                                                                                                                                                i32.const 0
                                                                                                                                                                                                i32.const 1
                                                                                                                                                                                                i32.sub
                                                                                                                                                                                                local.set 17
                                                                                                                                                                                                local.get 141
                                                                                                                                                                                                global.set 0
                                                                                                                                                                                                local.get 17
                                                                                                                                                                                                return
                                                                                                                                                                                              end
                                                                                                                                                                                              i32.const 8
                                                                                                                                                                                              local.set 140
                                                                                                                                                                                              br 91 (;@2;)
                                                                                                                                                                                            end
                                                                                                                                                                                            i32.const 2
                                                                                                                                                                                            local.set 140
                                                                                                                                                                                            br 90 (;@2;)
                                                                                                                                                                                          end
                                                                                                                                                                                          i32.const 8
                                                                                                                                                                                          local.set 140
                                                                                                                                                                                          br 89 (;@2;)
                                                                                                                                                                                        end
                                                                                                                                                                                        global.get 0
                                                                                                                                                                                        local.set 18
                                                                                                                                                                                        global.get 0
                                                                                                                                                                                        i32.const 4
                                                                                                                                                                                        i32.add
                                                                                                                                                                                        global.set 0
                                                                                                                                                                                        local.get 18
                                                                                                                                                                                        i32.const 0
                                                                                                                                                                                        i32.store
                                                                                                                                                                                        i32.const 17
                                                                                                                                                                                        local.set 140
                                                                                                                                                                                        br 88 (;@2;)
                                                                                                                                                                                      end
                                                                                                                                                                                      i32.const 0
                                                                                                                                                                                      i32.const 2
                                                                                                                                                                                      i32.sub
                                                                                                                                                                                      local.set 19
                                                                                                                                                                                      local.get 141
                                                                                                                                                                                      global.set 0
                                                                                                                                                                                      local.get 19
                                                                                                                                                                                      return
                                                                                                                                                                                    end
                                                                                                                                                                                    i32.const 13
                                                                                                                                                                                    local.set 140
                                                                                                                                                                                    br 86 (;@2;)
                                                                                                                                                                                  end
                                                                                                                                                                                  i32.const 10
                                                                                                                                                                                  local.set 140
                                                                                                                                                                                  br 85 (;@2;)
                                                                                                                                                                                end
                                                                                                                                                                                i32.const 13
                                                                                                                                                                                local.set 140
                                                                                                                                                                                br 84 (;@2;)
                                                                                                                                                                              end
                                                                                                                                                                              global.get 0
                                                                                                                                                                              local.set 20
                                                                                                                                                                              global.get 0
                                                                                                                                                                              i32.const 4
                                                                                                                                                                              i32.add
                                                                                                                                                                              global.set 0
                                                                                                                                                                              local.get 20
                                                                                                                                                                              i32.const 0
                                                                                                                                                                              i32.store
                                                                                                                                                                              i32.const 37
                                                                                                                                                                              local.set 140
                                                                                                                                                                              br 83 (;@2;)
                                                                                                                                                                            end
                                                                                                                                                                            i32.const 15
                                                                                                                                                                            local.set 140
                                                                                                                                                                            br 82 (;@2;)
                                                                                                                                                                          end
                                                                                                                                                                          local.get 18
                                                                                                                                                                          i32.load
                                                                                                                                                                          local.set 21
                                                                                                                                                                          local.get 21
                                                                                                                                                                          i32.const 10240
                                                                                                                                                                          i32.lt_s
                                                                                                                                                                          local.set 22
                                                                                                                                                                          local.get 22
                                                                                                                                                                          if  ;; label = @84
                                                                                                                                                                            i32.const 21
                                                                                                                                                                            local.set 140
                                                                                                                                                                            br 82 (;@2;)
                                                                                                                                                                          else
                                                                                                                                                                            i32.const 22
                                                                                                                                                                            local.set 140
                                                                                                                                                                            br 82 (;@2;)
                                                                                                                                                                          end
                                                                                                                                                                        end
                                                                                                                                                                        i32.const 16
                                                                                                                                                                        local.set 140
                                                                                                                                                                        br 80 (;@2;)
                                                                                                                                                                      end
                                                                                                                                                                      i32.const 17
                                                                                                                                                                      local.set 140
                                                                                                                                                                      br 79 (;@2;)
                                                                                                                                                                    end
                                                                                                                                                                    i32.const 19
                                                                                                                                                                    local.set 140
                                                                                                                                                                    br 78 (;@2;)
                                                                                                                                                                  end
                                                                                                                                                                  global.get 0
                                                                                                                                                                  local.set 23
                                                                                                                                                                  global.get 0
                                                                                                                                                                  i32.const 1
                                                                                                                                                                  i32.add
                                                                                                                                                                  global.set 0
                                                                                                                                                                  local.get 23
                                                                                                                                                                  i32.const 1
                                                                                                                                                                  i32.store8
                                                                                                                                                                  local.get 4
                                                                                                                                                                  i32.load
                                                                                                                                                                  local.set 24
                                                                                                                                                                  local.get 18
                                                                                                                                                                  i32.load
                                                                                                                                                                  local.set 25
                                                                                                                                                                  local.get 24
                                                                                                                                                                  local.get 25
                                                                                                                                                                  i32.const 4
                                                                                                                                                                  i32.mul
                                                                                                                                                                  i32.add
                                                                                                                                                                  local.set 26
                                                                                                                                                                  local.get 26
                                                                                                                                                                  f32.load
                                                                                                                                                                  local.set 27
                                                                                                                                                                  i32.const 1874919424
                                                                                                                                                                  f32.convert_i32_s
                                                                                                                                                                  local.set 28
                                                                                                                                                                  local.get 27
                                                                                                                                                                  local.get 28
                                                                                                                                                                  f32.gt
                                                                                                                                                                  local.set 29
                                                                                                                                                                  local.get 29
                                                                                                                                                                  if  ;; label = @80
                                                                                                                                                                    i32.const 25
                                                                                                                                                                    local.set 140
                                                                                                                                                                    br 78 (;@2;)
                                                                                                                                                                  else
                                                                                                                                                                    i32.const 26
                                                                                                                                                                    local.set 140
                                                                                                                                                                    br 78 (;@2;)
                                                                                                                                                                  end
                                                                                                                                                                end
                                                                                                                                                                i32.const 16
                                                                                                                                                                local.set 140
                                                                                                                                                                br 76 (;@2;)
                                                                                                                                                              end
                                                                                                                                                              i32.const 20
                                                                                                                                                              local.set 140
                                                                                                                                                              br 75 (;@2;)
                                                                                                                                                            end
                                                                                                                                                            local.get 18
                                                                                                                                                            i32.load
                                                                                                                                                            local.set 30
                                                                                                                                                            local.get 30
                                                                                                                                                            i32.const 1
                                                                                                                                                            i32.add
                                                                                                                                                            local.set 31
                                                                                                                                                            local.get 18
                                                                                                                                                            local.get 31
                                                                                                                                                            i32.store
                                                                                                                                                            i32.const 32
                                                                                                                                                            local.set 140
                                                                                                                                                            br 74 (;@2;)
                                                                                                                                                          end
                                                                                                                                                          i32.const 27
                                                                                                                                                          local.set 140
                                                                                                                                                          br 73 (;@2;)
                                                                                                                                                        end
                                                                                                                                                        local.get 4
                                                                                                                                                        i32.load
                                                                                                                                                        local.set 32
                                                                                                                                                        local.get 18
                                                                                                                                                        i32.load
                                                                                                                                                        local.set 33
                                                                                                                                                        local.get 32
                                                                                                                                                        local.get 33
                                                                                                                                                        i32.const 4
                                                                                                                                                        i32.mul
                                                                                                                                                        i32.add
                                                                                                                                                        local.set 34
                                                                                                                                                        local.get 34
                                                                                                                                                        f32.load
                                                                                                                                                        local.set 35
                                                                                                                                                        i32.const 1874919424
                                                                                                                                                        f32.convert_i32_s
                                                                                                                                                        local.set 36
                                                                                                                                                        f32.const 0x0p+0 (;=0;)
                                                                                                                                                        local.get 36
                                                                                                                                                        f32.sub
                                                                                                                                                        local.set 37
                                                                                                                                                        local.get 35
                                                                                                                                                        local.get 37
                                                                                                                                                        f32.lt
                                                                                                                                                        local.set 38
                                                                                                                                                        local.get 23
                                                                                                                                                        local.get 38
                                                                                                                                                        i32.store8
                                                                                                                                                        i32.const 27
                                                                                                                                                        local.set 140
                                                                                                                                                        br 72 (;@2;)
                                                                                                                                                      end
                                                                                                                                                      local.get 23
                                                                                                                                                      i32.load8_u
                                                                                                                                                      local.set 39
                                                                                                                                                      local.get 39
                                                                                                                                                      if  ;; label = @74
                                                                                                                                                        i32.const 28
                                                                                                                                                        local.set 140
                                                                                                                                                        br 72 (;@2;)
                                                                                                                                                      else
                                                                                                                                                        i32.const 29
                                                                                                                                                        local.set 140
                                                                                                                                                        br 72 (;@2;)
                                                                                                                                                      end
                                                                                                                                                    end
                                                                                                                                                    i32.const 0
                                                                                                                                                    i32.const 2
                                                                                                                                                    i32.sub
                                                                                                                                                    local.set 40
                                                                                                                                                    local.get 141
                                                                                                                                                    global.set 0
                                                                                                                                                    local.get 40
                                                                                                                                                    return
                                                                                                                                                  end
                                                                                                                                                  i32.const 30
                                                                                                                                                  local.set 140
                                                                                                                                                  br 69 (;@2;)
                                                                                                                                                end
                                                                                                                                                i32.const 24
                                                                                                                                                local.set 140
                                                                                                                                                br 68 (;@2;)
                                                                                                                                              end
                                                                                                                                              i32.const 30
                                                                                                                                              local.set 140
                                                                                                                                              br 67 (;@2;)
                                                                                                                                            end
                                                                                                                                            i32.const 23
                                                                                                                                            local.set 140
                                                                                                                                            br 66 (;@2;)
                                                                                                                                          end
                                                                                                                                          i32.const 23
                                                                                                                                          local.set 140
                                                                                                                                          br 65 (;@2;)
                                                                                                                                        end
                                                                                                                                        i32.const 17
                                                                                                                                        local.set 140
                                                                                                                                        br 64 (;@2;)
                                                                                                                                      end
                                                                                                                                      local.get 6
                                                                                                                                      i32.load
                                                                                                                                      local.set 41
                                                                                                                                      local.get 41
                                                                                                                                      i32.const 10240
                                                                                                                                      call 5
                                                                                                                                      local.set 42
                                                                                                                                      local.get 42
                                                                                                                                      i32.eqz
                                                                                                                                      local.set 43
                                                                                                                                      local.get 43
                                                                                                                                      if  ;; label = @66
                                                                                                                                        i32.const 92
                                                                                                                                        local.set 140
                                                                                                                                        br 64 (;@2;)
                                                                                                                                      else
                                                                                                                                        i32.const 93
                                                                                                                                        local.set 140
                                                                                                                                        br 64 (;@2;)
                                                                                                                                      end
                                                                                                                                    end
                                                                                                                                    i32.const 35
                                                                                                                                    local.set 140
                                                                                                                                    br 62 (;@2;)
                                                                                                                                  end
                                                                                                                                  local.get 20
                                                                                                                                  i32.load
                                                                                                                                  local.set 44
                                                                                                                                  local.get 44
                                                                                                                                  i32.const 2
                                                                                                                                  i32.lt_s
                                                                                                                                  local.set 45
                                                                                                                                  local.get 45
                                                                                                                                  if  ;; label = @64
                                                                                                                                    i32.const 41
                                                                                                                                    local.set 140
                                                                                                                                    br 62 (;@2;)
                                                                                                                                  else
                                                                                                                                    i32.const 42
                                                                                                                                    local.set 140
                                                                                                                                    br 62 (;@2;)
                                                                                                                                  end
                                                                                                                                end
                                                                                                                                i32.const 36
                                                                                                                                local.set 140
                                                                                                                                br 60 (;@2;)
                                                                                                                              end
                                                                                                                              i32.const 37
                                                                                                                              local.set 140
                                                                                                                              br 59 (;@2;)
                                                                                                                            end
                                                                                                                            i32.const 39
                                                                                                                            local.set 140
                                                                                                                            br 58 (;@2;)
                                                                                                                          end
                                                                                                                          i32.const 0
                                                                                                                          f32.convert_i32_s
                                                                                                                          local.set 46
                                                                                                                          global.get 0
                                                                                                                          local.set 47
                                                                                                                          global.get 0
                                                                                                                          i32.const 4
                                                                                                                          i32.add
                                                                                                                          global.set 0
                                                                                                                          local.get 47
                                                                                                                          local.get 46
                                                                                                                          f32.store
                                                                                                                          local.get 18
                                                                                                                          i32.const 0
                                                                                                                          i32.store
                                                                                                                          i32.const 46
                                                                                                                          local.set 140
                                                                                                                          br 57 (;@2;)
                                                                                                                        end
                                                                                                                        i32.const 36
                                                                                                                        local.set 140
                                                                                                                        br 56 (;@2;)
                                                                                                                      end
                                                                                                                      i32.const 40
                                                                                                                      local.set 140
                                                                                                                      br 55 (;@2;)
                                                                                                                    end
                                                                                                                    local.get 47
                                                                                                                    f32.load
                                                                                                                    local.set 48
                                                                                                                    i32.const 5120
                                                                                                                    f32.convert_i32_s
                                                                                                                    local.set 49
                                                                                                                    local.get 48
                                                                                                                    local.get 49
                                                                                                                    f32.div
                                                                                                                    local.set 50
                                                                                                                    global.get 0
                                                                                                                    local.set 51
                                                                                                                    global.get 0
                                                                                                                    i32.const 4
                                                                                                                    i32.add
                                                                                                                    global.set 0
                                                                                                                    local.get 51
                                                                                                                    local.get 50
                                                                                                                    f32.store
                                                                                                                    i32.const 0
                                                                                                                    f32.convert_i32_s
                                                                                                                    local.set 52
                                                                                                                    global.get 0
                                                                                                                    local.set 53
                                                                                                                    global.get 0
                                                                                                                    i32.const 4
                                                                                                                    i32.add
                                                                                                                    global.set 0
                                                                                                                    local.get 53
                                                                                                                    local.get 52
                                                                                                                    f32.store
                                                                                                                    local.get 18
                                                                                                                    i32.const 0
                                                                                                                    i32.store
                                                                                                                    i32.const 57
                                                                                                                    local.set 140
                                                                                                                    br 54 (;@2;)
                                                                                                                  end
                                                                                                                  i32.const 44
                                                                                                                  local.set 140
                                                                                                                  br 53 (;@2;)
                                                                                                                end
                                                                                                                local.get 18
                                                                                                                i32.load
                                                                                                                local.set 54
                                                                                                                local.get 54
                                                                                                                i32.const 5120
                                                                                                                i32.lt_s
                                                                                                                local.set 55
                                                                                                                local.get 55
                                                                                                                if  ;; label = @55
                                                                                                                  i32.const 50
                                                                                                                  local.set 140
                                                                                                                  br 53 (;@2;)
                                                                                                                else
                                                                                                                  i32.const 51
                                                                                                                  local.set 140
                                                                                                                  br 53 (;@2;)
                                                                                                                end
                                                                                                              end
                                                                                                              i32.const 45
                                                                                                              local.set 140
                                                                                                              br 51 (;@2;)
                                                                                                            end
                                                                                                            i32.const 46
                                                                                                            local.set 140
                                                                                                            br 50 (;@2;)
                                                                                                          end
                                                                                                          i32.const 48
                                                                                                          local.set 140
                                                                                                          br 49 (;@2;)
                                                                                                        end
                                                                                                        local.get 47
                                                                                                        f32.load
                                                                                                        local.set 56
                                                                                                        local.get 4
                                                                                                        i32.load
                                                                                                        local.set 57
                                                                                                        local.get 20
                                                                                                        i32.load
                                                                                                        local.set 58
                                                                                                        local.get 58
                                                                                                        i32.const 5120
                                                                                                        i32.mul
                                                                                                        local.set 59
                                                                                                        local.get 18
                                                                                                        i32.load
                                                                                                        local.set 60
                                                                                                        local.get 59
                                                                                                        local.get 60
                                                                                                        i32.add
                                                                                                        local.set 61
                                                                                                        local.get 57
                                                                                                        local.get 61
                                                                                                        i32.const 4
                                                                                                        i32.mul
                                                                                                        i32.add
                                                                                                        local.set 62
                                                                                                        local.get 62
                                                                                                        f32.load
                                                                                                        local.set 63
                                                                                                        local.get 56
                                                                                                        local.get 63
                                                                                                        f32.add
                                                                                                        local.set 64
                                                                                                        local.get 47
                                                                                                        local.get 64
                                                                                                        f32.store
                                                                                                        local.get 18
                                                                                                        i32.load
                                                                                                        local.set 65
                                                                                                        local.get 65
                                                                                                        i32.const 1
                                                                                                        i32.add
                                                                                                        local.set 66
                                                                                                        local.get 18
                                                                                                        local.get 66
                                                                                                        i32.store
                                                                                                        i32.const 52
                                                                                                        local.set 140
                                                                                                        br 48 (;@2;)
                                                                                                      end
                                                                                                      i32.const 45
                                                                                                      local.set 140
                                                                                                      br 47 (;@2;)
                                                                                                    end
                                                                                                    i32.const 49
                                                                                                    local.set 140
                                                                                                    br 46 (;@2;)
                                                                                                  end
                                                                                                  i32.const 52
                                                                                                  local.set 140
                                                                                                  br 45 (;@2;)
                                                                                                end
                                                                                                i32.const 46
                                                                                                local.set 140
                                                                                                br 44 (;@2;)
                                                                                              end
                                                                                              local.get 53
                                                                                              f32.load
                                                                                              local.set 67
                                                                                              i32.const 5120
                                                                                              f32.convert_i32_s
                                                                                              local.set 68
                                                                                              local.get 67
                                                                                              local.get 68
                                                                                              f32.div
                                                                                              local.set 69
                                                                                              local.get 53
                                                                                              local.get 69
                                                                                              f32.store
                                                                                              local.get 53
                                                                                              f32.load
                                                                                              local.set 70
                                                                                              f64.const 0x1.0c6f7a0b5ed8dp-20 (;=1e-06;)
                                                                                              f32.demote_f64
                                                                                              local.set 71
                                                                                              local.get 70
                                                                                              local.get 71
                                                                                              f32.add
                                                                                              local.set 72
                                                                                              local.get 72
                                                                                              f64.promote_f32
                                                                                              local.set 73
                                                                                              local.get 73
                                                                                              call 3
                                                                                              local.set 74
                                                                                              local.get 74
                                                                                              f32.demote_f64
                                                                                              local.set 75
                                                                                              global.get 0
                                                                                              local.set 76
                                                                                              global.get 0
                                                                                              i32.const 4
                                                                                              i32.add
                                                                                              global.set 0
                                                                                              local.get 76
                                                                                              local.get 75
                                                                                              f32.store
                                                                                              i32.const 1
                                                                                              f32.convert_i32_s
                                                                                              local.set 77
                                                                                              local.get 76
                                                                                              f32.load
                                                                                              local.set 78
                                                                                              local.get 77
                                                                                              local.get 78
                                                                                              f32.div
                                                                                              local.set 79
                                                                                              global.get 0
                                                                                              local.set 80
                                                                                              global.get 0
                                                                                              i32.const 4
                                                                                              i32.add
                                                                                              global.set 0
                                                                                              local.get 80
                                                                                              local.get 79
                                                                                              f32.store
                                                                                              global.get 0
                                                                                              local.set 81
                                                                                              global.get 0
                                                                                              i32.const 1
                                                                                              i32.add
                                                                                              global.set 0
                                                                                              local.get 81
                                                                                              i32.const 1
                                                                                              i32.store8
                                                                                              global.get 0
                                                                                              local.set 82
                                                                                              global.get 0
                                                                                              i32.const 1
                                                                                              i32.add
                                                                                              global.set 0
                                                                                              local.get 82
                                                                                              i32.const 1
                                                                                              i32.store8
                                                                                              local.get 51
                                                                                              f32.load
                                                                                              local.set 83
                                                                                              local.get 83
                                                                                              call 4
                                                                                              local.set 84
                                                                                              local.get 84
                                                                                              i32.eqz
                                                                                              local.set 85
                                                                                              local.get 85
                                                                                              if  ;; label = @46
                                                                                                i32.const 67
                                                                                                local.set 140
                                                                                                br 44 (;@2;)
                                                                                              else
                                                                                                i32.const 68
                                                                                                local.set 140
                                                                                                br 44 (;@2;)
                                                                                              end
                                                                                            end
                                                                                            i32.const 55
                                                                                            local.set 140
                                                                                            br 42 (;@2;)
                                                                                          end
                                                                                          local.get 18
                                                                                          i32.load
                                                                                          local.set 86
                                                                                          local.get 86
                                                                                          i32.const 5120
                                                                                          i32.lt_s
                                                                                          local.set 87
                                                                                          local.get 87
                                                                                          if  ;; label = @44
                                                                                            i32.const 61
                                                                                            local.set 140
                                                                                            br 42 (;@2;)
                                                                                          else
                                                                                            i32.const 62
                                                                                            local.set 140
                                                                                            br 42 (;@2;)
                                                                                          end
                                                                                        end
                                                                                        i32.const 56
                                                                                        local.set 140
                                                                                        br 40 (;@2;)
                                                                                      end
                                                                                      i32.const 57
                                                                                      local.set 140
                                                                                      br 39 (;@2;)
                                                                                    end
                                                                                    i32.const 59
                                                                                    local.set 140
                                                                                    br 38 (;@2;)
                                                                                  end
                                                                                  local.get 4
                                                                                  i32.load
                                                                                  local.set 88
                                                                                  local.get 20
                                                                                  i32.load
                                                                                  local.set 89
                                                                                  local.get 89
                                                                                  i32.const 5120
                                                                                  i32.mul
                                                                                  local.set 90
                                                                                  local.get 18
                                                                                  i32.load
                                                                                  local.set 91
                                                                                  local.get 90
                                                                                  local.get 91
                                                                                  i32.add
                                                                                  local.set 92
                                                                                  local.get 88
                                                                                  local.get 92
                                                                                  i32.const 4
                                                                                  i32.mul
                                                                                  i32.add
                                                                                  local.set 93
                                                                                  local.get 93
                                                                                  f32.load
                                                                                  local.set 94
                                                                                  local.get 51
                                                                                  f32.load
                                                                                  local.set 95
                                                                                  local.get 94
                                                                                  local.get 95
                                                                                  f32.sub
                                                                                  local.set 96
                                                                                  global.get 0
                                                                                  local.set 97
                                                                                  global.get 0
                                                                                  i32.const 4
                                                                                  i32.add
                                                                                  global.set 0
                                                                                  local.get 97
                                                                                  local.get 96
                                                                                  f32.store
                                                                                  local.get 53
                                                                                  f32.load
                                                                                  local.set 98
                                                                                  local.get 97
                                                                                  f32.load
                                                                                  local.set 99
                                                                                  local.get 97
                                                                                  f32.load
                                                                                  local.set 100
                                                                                  local.get 99
                                                                                  local.get 100
                                                                                  f32.mul
                                                                                  local.set 101
                                                                                  local.get 98
                                                                                  local.get 101
                                                                                  f32.add
                                                                                  local.set 102
                                                                                  local.get 53
                                                                                  local.get 102
                                                                                  f32.store
                                                                                  local.get 18
                                                                                  i32.load
                                                                                  local.set 103
                                                                                  local.get 103
                                                                                  i32.const 1
                                                                                  i32.add
                                                                                  local.set 104
                                                                                  local.get 18
                                                                                  local.get 104
                                                                                  i32.store
                                                                                  i32.const 63
                                                                                  local.set 140
                                                                                  br 37 (;@2;)
                                                                                end
                                                                                i32.const 56
                                                                                local.set 140
                                                                                br 36 (;@2;)
                                                                              end
                                                                              i32.const 60
                                                                              local.set 140
                                                                              br 35 (;@2;)
                                                                            end
                                                                            i32.const 63
                                                                            local.set 140
                                                                            br 34 (;@2;)
                                                                          end
                                                                          i32.const 57
                                                                          local.set 140
                                                                          br 33 (;@2;)
                                                                        end
                                                                        local.get 18
                                                                        i32.const 0
                                                                        i32.store
                                                                        i32.const 79
                                                                        local.set 140
                                                                        br 32 (;@2;)
                                                                      end
                                                                      i32.const 69
                                                                      local.set 140
                                                                      br 31 (;@2;)
                                                                    end
                                                                    local.get 53
                                                                    f32.load
                                                                    local.set 105
                                                                    local.get 105
                                                                    call 4
                                                                    local.set 106
                                                                    local.get 106
                                                                    i32.eqz
                                                                    local.set 107
                                                                    local.get 82
                                                                    local.get 107
                                                                    i32.store8
                                                                    i32.const 69
                                                                    local.set 140
                                                                    br 30 (;@2;)
                                                                  end
                                                                  local.get 82
                                                                  i32.load8_u
                                                                  local.set 108
                                                                  local.get 108
                                                                  if  ;; label = @32
                                                                    i32.const 70
                                                                    local.set 140
                                                                    br 30 (;@2;)
                                                                  else
                                                                    i32.const 71
                                                                    local.set 140
                                                                    br 30 (;@2;)
                                                                  end
                                                                end
                                                                i32.const 72
                                                                local.set 140
                                                                br 28 (;@2;)
                                                              end
                                                              local.get 80
                                                              f32.load
                                                              local.set 109
                                                              local.get 109
                                                              call 4
                                                              local.set 110
                                                              local.get 110
                                                              i32.eqz
                                                              local.set 111
                                                              local.get 81
                                                              local.get 111
                                                              i32.store8
                                                              i32.const 72
                                                              local.set 140
                                                              br 27 (;@2;)
                                                            end
                                                            local.get 81
                                                            i32.load8_u
                                                            local.set 112
                                                            local.get 112
                                                            if  ;; label = @29
                                                              i32.const 73
                                                              local.set 140
                                                              br 27 (;@2;)
                                                            else
                                                              i32.const 74
                                                              local.set 140
                                                              br 27 (;@2;)
                                                            end
                                                          end
                                                          i32.const 0
                                                          i32.const 3
                                                          i32.sub
                                                          local.set 113
                                                          local.get 141
                                                          global.set 0
                                                          local.get 113
                                                          return
                                                        end
                                                        i32.const 75
                                                        local.set 140
                                                        br 24 (;@2;)
                                                      end
                                                      i32.const 66
                                                      local.set 140
                                                      br 23 (;@2;)
                                                    end
                                                    i32.const 75
                                                    local.set 140
                                                    br 22 (;@2;)
                                                  end
                                                  local.get 20
                                                  i32.load
                                                  local.set 114
                                                  local.get 114
                                                  i32.const 1
                                                  i32.add
                                                  local.set 115
                                                  local.get 20
                                                  local.get 115
                                                  i32.store
                                                  i32.const 88
                                                  local.set 140
                                                  br 21 (;@2;)
                                                end
                                                i32.const 77
                                                local.set 140
                                                br 20 (;@2;)
                                              end
                                              local.get 18
                                              i32.load
                                              local.set 116
                                              local.get 116
                                              i32.const 5120
                                              i32.lt_s
                                              local.set 117
                                              local.get 117
                                              if  ;; label = @22
                                                i32.const 83
                                                local.set 140
                                                br 20 (;@2;)
                                              else
                                                i32.const 84
                                                local.set 140
                                                br 20 (;@2;)
                                              end
                                            end
                                            i32.const 78
                                            local.set 140
                                            br 18 (;@2;)
                                          end
                                          i32.const 79
                                          local.set 140
                                          br 17 (;@2;)
                                        end
                                        i32.const 81
                                        local.set 140
                                        br 16 (;@2;)
                                      end
                                      local.get 4
                                      i32.load
                                      local.set 118
                                      local.get 20
                                      i32.load
                                      local.set 119
                                      local.get 119
                                      i32.const 5120
                                      i32.mul
                                      local.set 120
                                      local.get 18
                                      i32.load
                                      local.set 121
                                      local.get 120
                                      local.get 121
                                      i32.add
                                      local.set 122
                                      local.get 118
                                      local.get 122
                                      i32.const 4
                                      i32.mul
                                      i32.add
                                      local.set 123
                                      local.get 123
                                      f32.load
                                      local.set 124
                                      local.get 51
                                      f32.load
                                      local.set 125
                                      local.get 124
                                      local.get 125
                                      f32.sub
                                      local.set 126
                                      local.get 80
                                      f32.load
                                      local.set 127
                                      local.get 126
                                      local.get 127
                                      f32.mul
                                      local.set 128
                                      local.get 6
                                      i32.load
                                      local.set 129
                                      local.get 6
                                      i32.load
                                      local.set 130
                                      local.get 20
                                      i32.load
                                      local.set 131
                                      local.get 131
                                      i32.const 5120
                                      i32.mul
                                      local.set 132
                                      local.get 18
                                      i32.load
                                      local.set 133
                                      local.get 132
                                      local.get 133
                                      i32.add
                                      local.set 134
                                      local.get 6
                                      i32.load
                                      local.set 135
                                      local.get 135
                                      local.get 134
                                      i32.const 4
                                      i32.mul
                                      i32.add
                                      local.set 136
                                      local.get 136
                                      local.get 128
                                      f32.store
                                      local.get 18
                                      i32.load
                                      local.set 137
                                      local.get 137
                                      i32.const 1
                                      i32.add
                                      local.set 138
                                      local.get 18
                                      local.get 138
                                      i32.store
                                      i32.const 85
                                      local.set 140
                                      br 15 (;@2;)
                                    end
                                    i32.const 78
                                    local.set 140
                                    br 14 (;@2;)
                                  end
                                  i32.const 82
                                  local.set 140
                                  br 13 (;@2;)
                                end
                                i32.const 85
                                local.set 140
                                br 12 (;@2;)
                              end
                              i32.const 79
                              local.set 140
                              br 11 (;@2;)
                            end
                            i32.const 43
                            local.set 140
                            br 10 (;@2;)
                          end
                          i32.const 43
                          local.set 140
                          br 9 (;@2;)
                        end
                        i32.const 37
                        local.set 140
                        br 8 (;@2;)
                      end
                      local.get 141
                      global.set 0
                      i32.const 0
                      return
                    end
                    i32.const 0
                    i32.const 3
                    i32.sub
                    local.set 139
                    local.get 141
                    global.set 0
                    local.get 139
                    return
                  end
                  i32.const 94
                  local.set 140
                  br 5 (;@2;)
                end
                i32.const 91
                local.set 140
                br 4 (;@2;)
              end
              i32.const 94
              local.set 140
              br 3 (;@2;)
            end
            i32.const 98
            local.set 140
            br 2 (;@2;)
          end
          i32.const 96
          local.set 140
          br 1 (;@2;)
        end
        i32.const 1
        local.set 140
        br 0 (;@2;)
      end
    end
    unreachable)
  (func (;9;) (type 5) (param i32 i32 i32 i32) (result i32)
    (local i32 i32 i32)
    global.get 0
    local.set 6
    block  ;; label = @1
      loop  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  local.get 5
                  br_table 0 (;@7;) 1 (;@6;) 2 (;@5;) 3 (;@4;) 4 (;@3;) 6 (;@1;)
                end
                local.get 0
                local.get 1
                local.get 2
                local.get 3
                call 8
                local.set 4
                local.get 6
                global.set 0
                local.get 4
                return
              end
              local.get 6
              global.set 0
              i32.const 0
              return
            end
            i32.const 4
            local.set 5
            br 2 (;@2;)
          end
          i32.const 2
          local.set 5
          br 1 (;@2;)
        end
        i32.const 1
        local.set 5
        br 0 (;@2;)
      end
    end
    unreachable)
  (func (;10;) (type 6) (param i32 i32 i32 i32 i32) (result i32)
    (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 i32 i32 i32 f32 f32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
    global.get 0
    local.set 63
    block  ;; label = @1
      loop  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        block  ;; label = @11
                          block  ;; label = @12
                            block  ;; label = @13
                              block  ;; label = @14
                                block  ;; label = @15
                                  block  ;; label = @16
                                    block  ;; label = @17
                                      block  ;; label = @18
                                        block  ;; label = @19
                                          block  ;; label = @20
                                            block  ;; label = @21
                                              block  ;; label = @22
                                                block  ;; label = @23
                                                  block  ;; label = @24
                                                    block  ;; label = @25
                                                      block  ;; label = @26
                                                        block  ;; label = @27
                                                          block  ;; label = @28
                                                            block  ;; label = @29
                                                              block  ;; label = @30
                                                                block  ;; label = @31
                                                                  block  ;; label = @32
                                                                    block  ;; label = @33
                                                                      block  ;; label = @34
                                                                        block  ;; label = @35
                                                                          block  ;; label = @36
                                                                            block  ;; label = @37
                                                                              block  ;; label = @38
                                                                                block  ;; label = @39
                                                                                  block  ;; label = @40
                                                                                    block  ;; label = @41
                                                                                      block  ;; label = @42
                                                                                        block  ;; label = @43
                                                                                          block  ;; label = @44
                                                                                            block  ;; label = @45
                                                                                              local.get 62
                                                                                              br_table 0 (;@45;) 1 (;@44;) 2 (;@43;) 3 (;@42;) 4 (;@41;) 5 (;@40;) 6 (;@39;) 7 (;@38;) 8 (;@37;) 9 (;@36;) 10 (;@35;) 11 (;@34;) 12 (;@33;) 13 (;@32;) 14 (;@31;) 15 (;@30;) 16 (;@29;) 17 (;@28;) 18 (;@27;) 19 (;@26;) 20 (;@25;) 21 (;@24;) 22 (;@23;) 23 (;@22;) 24 (;@21;) 25 (;@20;) 26 (;@19;) 27 (;@18;) 28 (;@17;) 29 (;@16;) 30 (;@15;) 31 (;@14;) 32 (;@13;) 33 (;@12;) 34 (;@11;) 35 (;@10;) 36 (;@9;) 37 (;@8;) 38 (;@7;) 39 (;@6;) 40 (;@5;) 41 (;@4;) 42 (;@3;) 44 (;@1;)
                                                                                            end
                                                                                            global.get 0
                                                                                            local.set 5
                                                                                            global.get 0
                                                                                            i32.const 4
                                                                                            i32.add
                                                                                            global.set 0
                                                                                            local.get 5
                                                                                            local.get 0
                                                                                            i32.store
                                                                                            global.get 0
                                                                                            local.set 6
                                                                                            global.get 0
                                                                                            i32.const 4
                                                                                            i32.add
                                                                                            global.set 0
                                                                                            local.get 6
                                                                                            local.get 1
                                                                                            i32.store
                                                                                            global.get 0
                                                                                            local.set 7
                                                                                            global.get 0
                                                                                            i32.const 4
                                                                                            i32.add
                                                                                            global.set 0
                                                                                            local.get 7
                                                                                            local.get 2
                                                                                            i32.store
                                                                                            global.get 0
                                                                                            local.set 8
                                                                                            global.get 0
                                                                                            i32.const 4
                                                                                            i32.add
                                                                                            global.set 0
                                                                                            local.get 8
                                                                                            local.get 3
                                                                                            i32.store
                                                                                            global.get 0
                                                                                            local.set 9
                                                                                            global.get 0
                                                                                            i32.const 4
                                                                                            i32.add
                                                                                            global.set 0
                                                                                            local.get 9
                                                                                            local.get 4
                                                                                            i32.store
                                                                                            global.get 0
                                                                                            local.set 10
                                                                                            global.get 0
                                                                                            i32.const 1
                                                                                            i32.add
                                                                                            global.set 0
                                                                                            local.get 10
                                                                                            i32.const 1
                                                                                            i32.store8
                                                                                            global.get 0
                                                                                            local.set 11
                                                                                            global.get 0
                                                                                            i32.const 1
                                                                                            i32.add
                                                                                            global.set 0
                                                                                            local.get 11
                                                                                            i32.const 1
                                                                                            i32.store8
                                                                                            global.get 0
                                                                                            local.set 12
                                                                                            global.get 0
                                                                                            i32.const 1
                                                                                            i32.add
                                                                                            global.set 0
                                                                                            local.get 12
                                                                                            i32.const 1
                                                                                            i32.store8
                                                                                            local.get 7
                                                                                            i32.load
                                                                                            local.set 13
                                                                                            local.get 13
                                                                                            i32.const 1
                                                                                            i32.lt_s
                                                                                            local.set 14
                                                                                            local.get 14
                                                                                            if  ;; label = @45
                                                                                              i32.const 3
                                                                                              local.set 62
                                                                                              br 43 (;@2;)
                                                                                            else
                                                                                              i32.const 4
                                                                                              local.set 62
                                                                                              br 43 (;@2;)
                                                                                            end
                                                                                          end
                                                                                          local.get 63
                                                                                          global.set 0
                                                                                          i32.const 0
                                                                                          return
                                                                                        end
                                                                                        global.get 0
                                                                                        local.set 15
                                                                                        global.get 0
                                                                                        i32.const 1
                                                                                        i32.add
                                                                                        global.set 0
                                                                                        local.get 15
                                                                                        i32.const 1
                                                                                        i32.store8
                                                                                        local.get 5
                                                                                        i32.load
                                                                                        local.set 16
                                                                                        local.get 7
                                                                                        i32.load
                                                                                        local.set 17
                                                                                        local.get 16
                                                                                        local.get 17
                                                                                        call 5
                                                                                        local.set 18
                                                                                        local.get 18
                                                                                        i32.eqz
                                                                                        local.set 19
                                                                                        local.get 19
                                                                                        if  ;; label = @43
                                                                                          i32.const 17
                                                                                          local.set 62
                                                                                          br 41 (;@2;)
                                                                                        else
                                                                                          i32.const 18
                                                                                          local.set 62
                                                                                          br 41 (;@2;)
                                                                                        end
                                                                                      end
                                                                                      i32.const 5
                                                                                      local.set 62
                                                                                      br 39 (;@2;)
                                                                                    end
                                                                                    local.get 7
                                                                                    i32.load
                                                                                    local.set 20
                                                                                    local.get 20
                                                                                    i32.const 10240
                                                                                    i32.gt_s
                                                                                    local.set 21
                                                                                    local.get 12
                                                                                    local.get 21
                                                                                    i32.store8
                                                                                    i32.const 5
                                                                                    local.set 62
                                                                                    br 38 (;@2;)
                                                                                  end
                                                                                  local.get 12
                                                                                  i32.load8_u
                                                                                  local.set 22
                                                                                  local.get 22
                                                                                  if  ;; label = @40
                                                                                    i32.const 6
                                                                                    local.set 62
                                                                                    br 38 (;@2;)
                                                                                  else
                                                                                    i32.const 7
                                                                                    local.set 62
                                                                                    br 38 (;@2;)
                                                                                  end
                                                                                end
                                                                                i32.const 8
                                                                                local.set 62
                                                                                br 36 (;@2;)
                                                                              end
                                                                              local.get 9
                                                                              i32.load
                                                                              local.set 23
                                                                              local.get 7
                                                                              i32.load
                                                                              local.set 24
                                                                              local.get 23
                                                                              local.get 24
                                                                              i32.lt_s
                                                                              local.set 25
                                                                              local.get 11
                                                                              local.get 25
                                                                              i32.store8
                                                                              i32.const 8
                                                                              local.set 62
                                                                              br 35 (;@2;)
                                                                            end
                                                                            local.get 11
                                                                            i32.load8_u
                                                                            local.set 26
                                                                            local.get 26
                                                                            if  ;; label = @37
                                                                              i32.const 9
                                                                              local.set 62
                                                                              br 35 (;@2;)
                                                                            else
                                                                              i32.const 10
                                                                              local.set 62
                                                                              br 35 (;@2;)
                                                                            end
                                                                          end
                                                                          i32.const 11
                                                                          local.set 62
                                                                          br 33 (;@2;)
                                                                        end
                                                                        local.get 9
                                                                        i32.load
                                                                        local.set 27
                                                                        local.get 27
                                                                        i32.const 10240
                                                                        i32.gt_s
                                                                        local.set 28
                                                                        local.get 10
                                                                        local.get 28
                                                                        i32.store8
                                                                        i32.const 11
                                                                        local.set 62
                                                                        br 32 (;@2;)
                                                                      end
                                                                      local.get 10
                                                                      i32.load8_u
                                                                      local.set 29
                                                                      local.get 29
                                                                      if  ;; label = @34
                                                                        i32.const 12
                                                                        local.set 62
                                                                        br 32 (;@2;)
                                                                      else
                                                                        i32.const 13
                                                                        local.set 62
                                                                        br 32 (;@2;)
                                                                      end
                                                                    end
                                                                    i32.const 0
                                                                    i32.const 1
                                                                    i32.sub
                                                                    local.set 30
                                                                    local.get 63
                                                                    global.set 0
                                                                    local.get 30
                                                                    return
                                                                  end
                                                                  i32.const 14
                                                                  local.set 62
                                                                  br 29 (;@2;)
                                                                end
                                                                i32.const 2
                                                                local.set 62
                                                                br 28 (;@2;)
                                                              end
                                                              i32.const 14
                                                              local.set 62
                                                              br 27 (;@2;)
                                                            end
                                                            global.get 0
                                                            local.set 31
                                                            global.get 0
                                                            i32.const 4
                                                            i32.add
                                                            global.set 0
                                                            local.get 31
                                                            i32.const 0
                                                            i32.store
                                                            i32.const 26
                                                            local.set 62
                                                            br 26 (;@2;)
                                                          end
                                                          i32.const 19
                                                          local.set 62
                                                          br 25 (;@2;)
                                                        end
                                                        local.get 6
                                                        i32.load
                                                        local.set 32
                                                        local.get 7
                                                        i32.load
                                                        local.set 33
                                                        local.get 32
                                                        local.get 33
                                                        call 5
                                                        local.set 34
                                                        local.get 34
                                                        i32.eqz
                                                        local.set 35
                                                        local.get 15
                                                        local.get 35
                                                        i32.store8
                                                        i32.const 19
                                                        local.set 62
                                                        br 24 (;@2;)
                                                      end
                                                      local.get 15
                                                      i32.load8_u
                                                      local.set 36
                                                      local.get 36
                                                      if  ;; label = @26
                                                        i32.const 20
                                                        local.set 62
                                                        br 24 (;@2;)
                                                      else
                                                        i32.const 21
                                                        local.set 62
                                                        br 24 (;@2;)
                                                      end
                                                    end
                                                    i32.const 0
                                                    i32.const 2
                                                    i32.sub
                                                    local.set 37
                                                    local.get 63
                                                    global.set 0
                                                    local.get 37
                                                    return
                                                  end
                                                  i32.const 22
                                                  local.set 62
                                                  br 21 (;@2;)
                                                end
                                                i32.const 16
                                                local.set 62
                                                br 20 (;@2;)
                                              end
                                              i32.const 22
                                              local.set 62
                                              br 19 (;@2;)
                                            end
                                            local.get 8
                                            i32.load
                                            local.set 38
                                            local.get 7
                                            i32.load
                                            local.set 39
                                            local.get 38
                                            local.get 39
                                            call 5
                                            local.set 40
                                            local.get 40
                                            i32.eqz
                                            local.set 41
                                            local.get 41
                                            if  ;; label = @21
                                              i32.const 36
                                              local.set 62
                                              br 19 (;@2;)
                                            else
                                              i32.const 37
                                              local.set 62
                                              br 19 (;@2;)
                                            end
                                          end
                                          i32.const 24
                                          local.set 62
                                          br 17 (;@2;)
                                        end
                                        local.get 31
                                        i32.load
                                        local.set 42
                                        local.get 7
                                        i32.load
                                        local.set 43
                                        local.get 42
                                        local.get 43
                                        i32.lt_s
                                        local.set 44
                                        local.get 44
                                        if  ;; label = @19
                                          i32.const 30
                                          local.set 62
                                          br 17 (;@2;)
                                        else
                                          i32.const 31
                                          local.set 62
                                          br 17 (;@2;)
                                        end
                                      end
                                      i32.const 25
                                      local.set 62
                                      br 15 (;@2;)
                                    end
                                    i32.const 26
                                    local.set 62
                                    br 14 (;@2;)
                                  end
                                  i32.const 28
                                  local.set 62
                                  br 13 (;@2;)
                                end
                                local.get 5
                                i32.load
                                local.set 45
                                local.get 31
                                i32.load
                                local.set 46
                                local.get 45
                                local.get 46
                                i32.const 4
                                i32.mul
                                i32.add
                                local.set 47
                                local.get 47
                                f32.load
                                local.set 48
                                local.get 6
                                i32.load
                                local.set 49
                                local.get 31
                                i32.load
                                local.set 50
                                local.get 49
                                local.get 50
                                i32.const 4
                                i32.mul
                                i32.add
                                local.set 51
                                local.get 51
                                f32.load
                                local.set 52
                                local.get 48
                                local.get 52
                                f32.add
                                local.set 53
                                local.get 8
                                i32.load
                                local.set 54
                                local.get 8
                                i32.load
                                local.set 55
                                local.get 31
                                i32.load
                                local.set 56
                                local.get 8
                                i32.load
                                local.set 57
                                local.get 57
                                local.get 56
                                i32.const 4
                                i32.mul
                                i32.add
                                local.set 58
                                local.get 58
                                local.get 53
                                f32.store
                                local.get 31
                                i32.load
                                local.set 59
                                local.get 59
                                i32.const 1
                                i32.add
                                local.set 60
                                local.get 31
                                local.get 60
                                i32.store
                                i32.const 32
                                local.set 62
                                br 12 (;@2;)
                              end
                              i32.const 25
                              local.set 62
                              br 11 (;@2;)
                            end
                            i32.const 29
                            local.set 62
                            br 10 (;@2;)
                          end
                          i32.const 32
                          local.set 62
                          br 9 (;@2;)
                        end
                        i32.const 26
                        local.set 62
                        br 8 (;@2;)
                      end
                      local.get 63
                      global.set 0
                      i32.const 0
                      return
                    end
                    i32.const 0
                    i32.const 3
                    i32.sub
                    local.set 61
                    local.get 63
                    global.set 0
                    local.get 61
                    return
                  end
                  i32.const 38
                  local.set 62
                  br 5 (;@2;)
                end
                i32.const 35
                local.set 62
                br 4 (;@2;)
              end
              i32.const 38
              local.set 62
              br 3 (;@2;)
            end
            i32.const 42
            local.set 62
            br 2 (;@2;)
          end
          i32.const 40
          local.set 62
          br 1 (;@2;)
        end
        i32.const 1
        local.set 62
        br 0 (;@2;)
      end
    end
    unreachable)
  (func (;11;) (type 6) (param i32 i32 i32 i32 i32) (result i32)
    (local i32 i32 i32)
    global.get 0
    local.set 7
    block  ;; label = @1
      loop  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  local.get 6
                  br_table 0 (;@7;) 1 (;@6;) 2 (;@5;) 3 (;@4;) 4 (;@3;) 6 (;@1;)
                end
                local.get 0
                local.get 1
                local.get 2
                local.get 3
                local.get 4
                call 10
                local.set 5
                local.get 7
                global.set 0
                local.get 5
                return
              end
              local.get 7
              global.set 0
              i32.const 0
              return
            end
            i32.const 4
            local.set 6
            br 2 (;@2;)
          end
          i32.const 2
          local.set 6
          br 1 (;@2;)
        end
        i32.const 1
        local.set 6
        br 0 (;@2;)
      end
    end
    unreachable)
  (func (;12;) (type 7) (param i32 i32 i32 i32 i32 i32) (result i32)
    (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 i32 i32 i32 f32 f32 i32 i32 i32 i32 i32 i32 i32 f32 f32 f32 i32 i32 i32 i32 f32 f32 f32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
    global.get 0
    local.set 79
    block  ;; label = @1
      loop  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        block  ;; label = @11
                          block  ;; label = @12
                            block  ;; label = @13
                              block  ;; label = @14
                                block  ;; label = @15
                                  block  ;; label = @16
                                    block  ;; label = @17
                                      block  ;; label = @18
                                        block  ;; label = @19
                                          block  ;; label = @20
                                            block  ;; label = @21
                                              block  ;; label = @22
                                                block  ;; label = @23
                                                  block  ;; label = @24
                                                    block  ;; label = @25
                                                      block  ;; label = @26
                                                        block  ;; label = @27
                                                          block  ;; label = @28
                                                            block  ;; label = @29
                                                              block  ;; label = @30
                                                                block  ;; label = @31
                                                                  block  ;; label = @32
                                                                    block  ;; label = @33
                                                                      block  ;; label = @34
                                                                        block  ;; label = @35
                                                                          block  ;; label = @36
                                                                            block  ;; label = @37
                                                                              block  ;; label = @38
                                                                                block  ;; label = @39
                                                                                  block  ;; label = @40
                                                                                    block  ;; label = @41
                                                                                      block  ;; label = @42
                                                                                        block  ;; label = @43
                                                                                          block  ;; label = @44
                                                                                            block  ;; label = @45
                                                                                              block  ;; label = @46
                                                                                                block  ;; label = @47
                                                                                                  block  ;; label = @48
                                                                                                    block  ;; label = @49
                                                                                                      block  ;; label = @50
                                                                                                        block  ;; label = @51
                                                                                                          block  ;; label = @52
                                                                                                            block  ;; label = @53
                                                                                                              block  ;; label = @54
                                                                                                                local.get 78
                                                                                                                br_table 0 (;@54;) 1 (;@53;) 2 (;@52;) 3 (;@51;) 4 (;@50;) 5 (;@49;) 6 (;@48;) 7 (;@47;) 8 (;@46;) 9 (;@45;) 10 (;@44;) 11 (;@43;) 12 (;@42;) 13 (;@41;) 14 (;@40;) 15 (;@39;) 16 (;@38;) 17 (;@37;) 18 (;@36;) 19 (;@35;) 20 (;@34;) 21 (;@33;) 22 (;@32;) 23 (;@31;) 24 (;@30;) 25 (;@29;) 26 (;@28;) 27 (;@27;) 28 (;@26;) 29 (;@25;) 30 (;@24;) 31 (;@23;) 32 (;@22;) 33 (;@21;) 34 (;@20;) 35 (;@19;) 36 (;@18;) 37 (;@17;) 38 (;@16;) 39 (;@15;) 40 (;@14;) 41 (;@13;) 42 (;@12;) 43 (;@11;) 44 (;@10;) 45 (;@9;) 46 (;@8;) 47 (;@7;) 48 (;@6;) 49 (;@5;) 50 (;@4;) 51 (;@3;) 53 (;@1;)
                                                                                                              end
                                                                                                              global.get 0
                                                                                                              local.set 6
                                                                                                              global.get 0
                                                                                                              i32.const 4
                                                                                                              i32.add
                                                                                                              global.set 0
                                                                                                              local.get 6
                                                                                                              local.get 0
                                                                                                              i32.store
                                                                                                              global.get 0
                                                                                                              local.set 7
                                                                                                              global.get 0
                                                                                                              i32.const 4
                                                                                                              i32.add
                                                                                                              global.set 0
                                                                                                              local.get 7
                                                                                                              local.get 1
                                                                                                              i32.store
                                                                                                              global.get 0
                                                                                                              local.set 8
                                                                                                              global.get 0
                                                                                                              i32.const 4
                                                                                                              i32.add
                                                                                                              global.set 0
                                                                                                              local.get 8
                                                                                                              local.get 2
                                                                                                              i32.store
                                                                                                              global.get 0
                                                                                                              local.set 9
                                                                                                              global.get 0
                                                                                                              i32.const 4
                                                                                                              i32.add
                                                                                                              global.set 0
                                                                                                              local.get 9
                                                                                                              local.get 3
                                                                                                              i32.store
                                                                                                              global.get 0
                                                                                                              local.set 10
                                                                                                              global.get 0
                                                                                                              i32.const 4
                                                                                                              i32.add
                                                                                                              global.set 0
                                                                                                              local.get 10
                                                                                                              local.get 4
                                                                                                              i32.store
                                                                                                              global.get 0
                                                                                                              local.set 11
                                                                                                              global.get 0
                                                                                                              i32.const 4
                                                                                                              i32.add
                                                                                                              global.set 0
                                                                                                              local.get 11
                                                                                                              local.get 5
                                                                                                              i32.store
                                                                                                              global.get 0
                                                                                                              local.set 12
                                                                                                              global.get 0
                                                                                                              i32.const 1
                                                                                                              i32.add
                                                                                                              global.set 0
                                                                                                              local.get 12
                                                                                                              i32.const 1
                                                                                                              i32.store8
                                                                                                              local.get 9
                                                                                                              i32.load
                                                                                                              local.set 13
                                                                                                              local.get 13
                                                                                                              i32.const 2
                                                                                                              i32.ne
                                                                                                              local.set 14
                                                                                                              local.get 14
                                                                                                              if  ;; label = @54
                                                                                                                i32.const 3
                                                                                                                local.set 78
                                                                                                                br 52 (;@2;)
                                                                                                              else
                                                                                                                i32.const 4
                                                                                                                local.set 78
                                                                                                                br 52 (;@2;)
                                                                                                              end
                                                                                                            end
                                                                                                            local.get 79
                                                                                                            global.set 0
                                                                                                            i32.const 0
                                                                                                            return
                                                                                                          end
                                                                                                          global.get 0
                                                                                                          local.set 15
                                                                                                          global.get 0
                                                                                                          i32.const 1
                                                                                                          i32.add
                                                                                                          global.set 0
                                                                                                          local.get 15
                                                                                                          i32.const 1
                                                                                                          i32.store8
                                                                                                          global.get 0
                                                                                                          local.set 16
                                                                                                          global.get 0
                                                                                                          i32.const 1
                                                                                                          i32.add
                                                                                                          global.set 0
                                                                                                          local.get 16
                                                                                                          i32.const 1
                                                                                                          i32.store8
                                                                                                          local.get 6
                                                                                                          i32.load
                                                                                                          local.set 17
                                                                                                          local.get 17
                                                                                                          i32.const 10240
                                                                                                          call 5
                                                                                                          local.set 18
                                                                                                          local.get 18
                                                                                                          i32.eqz
                                                                                                          local.set 19
                                                                                                          local.get 19
                                                                                                          if  ;; label = @52
                                                                                                            i32.const 11
                                                                                                            local.set 78
                                                                                                            br 50 (;@2;)
                                                                                                          else
                                                                                                            i32.const 12
                                                                                                            local.set 78
                                                                                                            br 50 (;@2;)
                                                                                                          end
                                                                                                        end
                                                                                                        i32.const 5
                                                                                                        local.set 78
                                                                                                        br 48 (;@2;)
                                                                                                      end
                                                                                                      local.get 11
                                                                                                      i32.load
                                                                                                      local.set 20
                                                                                                      local.get 20
                                                                                                      i32.const 10240
                                                                                                      i32.ne
                                                                                                      local.set 21
                                                                                                      local.get 12
                                                                                                      local.get 21
                                                                                                      i32.store8
                                                                                                      i32.const 5
                                                                                                      local.set 78
                                                                                                      br 47 (;@2;)
                                                                                                    end
                                                                                                    local.get 12
                                                                                                    i32.load8_u
                                                                                                    local.set 22
                                                                                                    local.get 22
                                                                                                    if  ;; label = @49
                                                                                                      i32.const 6
                                                                                                      local.set 78
                                                                                                      br 47 (;@2;)
                                                                                                    else
                                                                                                      i32.const 7
                                                                                                      local.set 78
                                                                                                      br 47 (;@2;)
                                                                                                    end
                                                                                                  end
                                                                                                  i32.const 0
                                                                                                  i32.const 1
                                                                                                  i32.sub
                                                                                                  local.set 23
                                                                                                  local.get 79
                                                                                                  global.set 0
                                                                                                  local.get 23
                                                                                                  return
                                                                                                end
                                                                                                i32.const 8
                                                                                                local.set 78
                                                                                                br 44 (;@2;)
                                                                                              end
                                                                                              i32.const 2
                                                                                              local.set 78
                                                                                              br 43 (;@2;)
                                                                                            end
                                                                                            i32.const 8
                                                                                            local.set 78
                                                                                            br 42 (;@2;)
                                                                                          end
                                                                                          global.get 0
                                                                                          local.set 24
                                                                                          global.get 0
                                                                                          i32.const 4
                                                                                          i32.add
                                                                                          global.set 0
                                                                                          local.get 24
                                                                                          i32.const 0
                                                                                          i32.store
                                                                                          global.get 0
                                                                                          local.set 25
                                                                                          global.get 0
                                                                                          i32.const 4
                                                                                          i32.add
                                                                                          global.set 0
                                                                                          local.get 25
                                                                                          i32.const 0
                                                                                          i32.store
                                                                                          i32.const 23
                                                                                          local.set 78
                                                                                          br 41 (;@2;)
                                                                                        end
                                                                                        i32.const 13
                                                                                        local.set 78
                                                                                        br 40 (;@2;)
                                                                                      end
                                                                                      local.get 7
                                                                                      i32.load
                                                                                      local.set 26
                                                                                      local.get 26
                                                                                      i32.const 5120
                                                                                      call 5
                                                                                      local.set 27
                                                                                      local.get 27
                                                                                      i32.eqz
                                                                                      local.set 28
                                                                                      local.get 16
                                                                                      local.get 28
                                                                                      i32.store8
                                                                                      i32.const 13
                                                                                      local.set 78
                                                                                      br 39 (;@2;)
                                                                                    end
                                                                                    local.get 16
                                                                                    i32.load8_u
                                                                                    local.set 29
                                                                                    local.get 29
                                                                                    if  ;; label = @41
                                                                                      i32.const 14
                                                                                      local.set 78
                                                                                      br 39 (;@2;)
                                                                                    else
                                                                                      i32.const 15
                                                                                      local.set 78
                                                                                      br 39 (;@2;)
                                                                                    end
                                                                                  end
                                                                                  i32.const 16
                                                                                  local.set 78
                                                                                  br 37 (;@2;)
                                                                                end
                                                                                local.get 8
                                                                                i32.load
                                                                                local.set 30
                                                                                local.get 30
                                                                                i32.const 5120
                                                                                call 5
                                                                                local.set 31
                                                                                local.get 31
                                                                                i32.eqz
                                                                                local.set 32
                                                                                local.get 15
                                                                                local.get 32
                                                                                i32.store8
                                                                                i32.const 16
                                                                                local.set 78
                                                                                br 36 (;@2;)
                                                                              end
                                                                              local.get 15
                                                                              i32.load8_u
                                                                              local.set 33
                                                                              local.get 33
                                                                              if  ;; label = @38
                                                                                i32.const 17
                                                                                local.set 78
                                                                                br 36 (;@2;)
                                                                              else
                                                                                i32.const 18
                                                                                local.set 78
                                                                                br 36 (;@2;)
                                                                              end
                                                                            end
                                                                            i32.const 0
                                                                            i32.const 2
                                                                            i32.sub
                                                                            local.set 34
                                                                            local.get 79
                                                                            global.set 0
                                                                            local.get 34
                                                                            return
                                                                          end
                                                                          i32.const 19
                                                                          local.set 78
                                                                          br 33 (;@2;)
                                                                        end
                                                                        i32.const 10
                                                                        local.set 78
                                                                        br 32 (;@2;)
                                                                      end
                                                                      i32.const 19
                                                                      local.set 78
                                                                      br 31 (;@2;)
                                                                    end
                                                                    local.get 10
                                                                    i32.load
                                                                    local.set 35
                                                                    local.get 35
                                                                    i32.const 10240
                                                                    call 5
                                                                    local.set 36
                                                                    local.get 36
                                                                    i32.eqz
                                                                    local.set 37
                                                                    local.get 37
                                                                    if  ;; label = @33
                                                                      i32.const 45
                                                                      local.set 78
                                                                      br 31 (;@2;)
                                                                    else
                                                                      i32.const 46
                                                                      local.set 78
                                                                      br 31 (;@2;)
                                                                    end
                                                                  end
                                                                  i32.const 21
                                                                  local.set 78
                                                                  br 29 (;@2;)
                                                                end
                                                                local.get 24
                                                                i32.load
                                                                local.set 38
                                                                local.get 38
                                                                i32.const 2
                                                                i32.lt_s
                                                                local.set 39
                                                                local.get 39
                                                                if  ;; label = @31
                                                                  i32.const 27
                                                                  local.set 78
                                                                  br 29 (;@2;)
                                                                else
                                                                  i32.const 28
                                                                  local.set 78
                                                                  br 29 (;@2;)
                                                                end
                                                              end
                                                              i32.const 22
                                                              local.set 78
                                                              br 27 (;@2;)
                                                            end
                                                            i32.const 23
                                                            local.set 78
                                                            br 26 (;@2;)
                                                          end
                                                          i32.const 25
                                                          local.set 78
                                                          br 25 (;@2;)
                                                        end
                                                        local.get 25
                                                        i32.const 0
                                                        i32.store
                                                        i32.const 32
                                                        local.set 78
                                                        br 24 (;@2;)
                                                      end
                                                      i32.const 22
                                                      local.set 78
                                                      br 23 (;@2;)
                                                    end
                                                    i32.const 26
                                                    local.set 78
                                                    br 22 (;@2;)
                                                  end
                                                  local.get 24
                                                  i32.load
                                                  local.set 40
                                                  local.get 40
                                                  i32.const 1
                                                  i32.add
                                                  local.set 41
                                                  local.get 24
                                                  local.get 41
                                                  i32.store
                                                  i32.const 41
                                                  local.set 78
                                                  br 21 (;@2;)
                                                end
                                                i32.const 30
                                                local.set 78
                                                br 20 (;@2;)
                                              end
                                              local.get 25
                                              i32.load
                                              local.set 42
                                              local.get 42
                                              i32.const 5120
                                              i32.lt_s
                                              local.set 43
                                              local.get 43
                                              if  ;; label = @22
                                                i32.const 36
                                                local.set 78
                                                br 20 (;@2;)
                                              else
                                                i32.const 37
                                                local.set 78
                                                br 20 (;@2;)
                                              end
                                            end
                                            i32.const 31
                                            local.set 78
                                            br 18 (;@2;)
                                          end
                                          i32.const 32
                                          local.set 78
                                          br 17 (;@2;)
                                        end
                                        i32.const 34
                                        local.set 78
                                        br 16 (;@2;)
                                      end
                                      i32.const 1
                                      f32.convert_i32_s
                                      local.set 44
                                      local.get 8
                                      i32.load
                                      local.set 45
                                      local.get 25
                                      i32.load
                                      local.set 46
                                      local.get 45
                                      local.get 46
                                      i32.const 4
                                      i32.mul
                                      i32.add
                                      local.set 47
                                      local.get 47
                                      f32.load
                                      local.set 48
                                      local.get 44
                                      local.get 48
                                      f32.add
                                      local.set 49
                                      global.get 0
                                      local.set 50
                                      global.get 0
                                      i32.const 4
                                      i32.add
                                      global.set 0
                                      local.get 50
                                      local.get 49
                                      f32.store
                                      local.get 6
                                      i32.load
                                      local.set 51
                                      local.get 24
                                      i32.load
                                      local.set 52
                                      local.get 52
                                      i32.const 5120
                                      i32.mul
                                      local.set 53
                                      local.get 25
                                      i32.load
                                      local.set 54
                                      local.get 53
                                      local.get 54
                                      i32.add
                                      local.set 55
                                      local.get 51
                                      local.get 55
                                      i32.const 4
                                      i32.mul
                                      i32.add
                                      local.set 56
                                      local.get 56
                                      f32.load
                                      local.set 57
                                      local.get 50
                                      f32.load
                                      local.set 58
                                      local.get 57
                                      local.get 58
                                      f32.mul
                                      local.set 59
                                      global.get 0
                                      local.set 60
                                      global.get 0
                                      i32.const 4
                                      i32.add
                                      global.set 0
                                      local.get 60
                                      local.get 59
                                      f32.store
                                      local.get 7
                                      i32.load
                                      local.set 61
                                      local.get 25
                                      i32.load
                                      local.set 62
                                      local.get 61
                                      local.get 62
                                      i32.const 4
                                      i32.mul
                                      i32.add
                                      local.set 63
                                      local.get 63
                                      f32.load
                                      local.set 64
                                      local.get 60
                                      f32.load
                                      local.set 65
                                      local.get 64
                                      local.get 65
                                      f32.add
                                      local.set 66
                                      local.get 10
                                      i32.load
                                      local.set 67
                                      local.get 10
                                      i32.load
                                      local.set 68
                                      local.get 24
                                      i32.load
                                      local.set 69
                                      local.get 69
                                      i32.const 5120
                                      i32.mul
                                      local.set 70
                                      local.get 25
                                      i32.load
                                      local.set 71
                                      local.get 70
                                      local.get 71
                                      i32.add
                                      local.set 72
                                      local.get 10
                                      i32.load
                                      local.set 73
                                      local.get 73
                                      local.get 72
                                      i32.const 4
                                      i32.mul
                                      i32.add
                                      local.set 74
                                      local.get 74
                                      local.get 66
                                      f32.store
                                      local.get 25
                                      i32.load
                                      local.set 75
                                      local.get 75
                                      i32.const 1
                                      i32.add
                                      local.set 76
                                      local.get 25
                                      local.get 76
                                      i32.store
                                      i32.const 38
                                      local.set 78
                                      br 15 (;@2;)
                                    end
                                    i32.const 31
                                    local.set 78
                                    br 14 (;@2;)
                                  end
                                  i32.const 35
                                  local.set 78
                                  br 13 (;@2;)
                                end
                                i32.const 38
                                local.set 78
                                br 12 (;@2;)
                              end
                              i32.const 32
                              local.set 78
                              br 11 (;@2;)
                            end
                            i32.const 29
                            local.set 78
                            br 10 (;@2;)
                          end
                          i32.const 29
                          local.set 78
                          br 9 (;@2;)
                        end
                        i32.const 23
                        local.set 78
                        br 8 (;@2;)
                      end
                      local.get 79
                      global.set 0
                      i32.const 0
                      return
                    end
                    i32.const 0
                    i32.const 3
                    i32.sub
                    local.set 77
                    local.get 79
                    global.set 0
                    local.get 77
                    return
                  end
                  i32.const 47
                  local.set 78
                  br 5 (;@2;)
                end
                i32.const 44
                local.set 78
                br 4 (;@2;)
              end
              i32.const 47
              local.set 78
              br 3 (;@2;)
            end
            i32.const 51
            local.set 78
            br 2 (;@2;)
          end
          i32.const 49
          local.set 78
          br 1 (;@2;)
        end
        i32.const 1
        local.set 78
        br 0 (;@2;)
      end
    end
    unreachable)
  (func (;13;) (type 7) (param i32 i32 i32 i32 i32 i32) (result i32)
    (local i32 i32 i32)
    global.get 0
    local.set 8
    block  ;; label = @1
      loop  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  local.get 7
                  br_table 0 (;@7;) 1 (;@6;) 2 (;@5;) 3 (;@4;) 4 (;@3;) 6 (;@1;)
                end
                local.get 0
                local.get 1
                local.get 2
                local.get 3
                local.get 4
                local.get 5
                call 12
                local.set 6
                local.get 8
                global.set 0
                local.get 6
                return
              end
              local.get 8
              global.set 0
              i32.const 0
              return
            end
            i32.const 4
            local.set 7
            br 2 (;@2;)
          end
          i32.const 2
          local.set 7
          br 1 (;@2;)
        end
        i32.const 1
        local.set 7
        br 0 (;@2;)
      end
    end
    unreachable)
  (func (;14;) (type 3) (param i32 i32) (result i32)
    (local i32 i32 i32)
    global.get 0
    local.set 4
    block  ;; label = @1
      loop  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  local.get 3
                  br_table 0 (;@7;) 1 (;@6;) 2 (;@5;) 3 (;@4;) 4 (;@3;) 6 (;@1;)
                end
                local.get 0
                local.set 2
                local.get 4
                global.set 0
                i32.const 0
                return
              end
              local.get 4
              global.set 0
              i32.const 0
              return
            end
            i32.const 4
            local.set 3
            br 2 (;@2;)
          end
          i32.const 2
          local.set 3
          br 1 (;@2;)
        end
        i32.const 1
        local.set 3
        br 0 (;@2;)
      end
    end
    unreachable)
  (table (;0;) 11 11 funcref)
  (memory (;0;) 16)
  (global (;0;) (mut i32) (i32.const 65536))
  (global (;1;) (mut i32) (i32.const 196608))
  (global (;2;) (mut i32) (i32.const 0))
  (global (;3;) (mut i32) (i32.const 0))
  (global (;4;) (mut i32) (i32.const -1))
  (global (;5;) (mut i32) (i32.const 0))
  (global (;6;) (mut i32) (i32.const 0))
  (global (;7;) (mut i32) (i32.const 0))
  (global (;8;) (mut i32) (i32.const 0))
  (global (;9;) (mut i32) (i32.const 0))
  (global (;10;) (mut i32) (i32.const 0))
  (export "memory" (memory 0))
  (export "__hike_sp" (global 0))
  (export "__hike_heap" (global 1))
  (export "Finite" (func 4))
  (export "Valid" (func 5))
  (export "__hike_impl_Sinusoidal" (func 6))
  (export "Sinusoidal" (func 7))
  (export "__hike_impl_LayerNorm" (func 8))
  (export "LayerNorm" (func 9))
  (export "__hike_impl_Add" (func 10))
  (export "Add" (func 11))
  (export "__hike_impl_Modulate" (func 12))
  (export "Modulate" (func 13))
  (export "main" (func 14))
  (elem (;0;) (i32.const 0) func 4 5 6 7 8 9 10 11 12 13 14))
